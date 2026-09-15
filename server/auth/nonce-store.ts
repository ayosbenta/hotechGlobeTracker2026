import type { Redis } from "@upstash/redis";

const NONCE_TTL_SECONDS = 300;

export interface LoginTransaction {
  loginToken: string;
  nonce: string;
  createdAt: string;
}

export interface NonceStore {
  create(): Promise<LoginTransaction>;
  peek(loginToken: string): Promise<{ nonceHash: string } | null>;
  /**
   * Atomically compares the stored nonce hash and, only on exact match,
   * deletes the transaction. Never partially consumes on mismatch, and never
   * allows a second caller to consume the same transaction concurrently.
   */
  consumeIfMatches(
    loginToken: string,
    expectedNonceHash: string,
  ): Promise<boolean>;
  discard(loginToken: string): Promise<void>;
}

export class NonceStoreUnavailableError extends Error {
  constructor() {
    super("Login transaction store is unavailable.");
    this.name = "NonceStoreUnavailableError";
  }
}

interface Sha256 {
  (value: string): string;
}

function redisKey(loginTokenHash: string): string {
  return `hotech:auth:login:${loginTokenHash}`;
}

/**
 * Consumption is a Lua script executed by Redis: it reads, compares, and
 * deletes atomically server-side, so two concurrent requests for the same
 * transaction can never both succeed.
 */
const CONSUME_SCRIPT = `
local stored = redis.call("GET", KEYS[1])
if not stored then
  return 0
end
if stored ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

export function createUpstashNonceStore(
  redis: Redis,
  sha256: Sha256,
  randomToken: (length?: number) => string,
): NonceStore {
  return {
    async create() {
      const loginToken = randomToken(32);
      const nonce = randomToken(32);
      const loginTokenHash = sha256(loginToken);
      const nonceHash = sha256(nonce);
      let stored: string | null;
      try {
        stored = await redis.set(redisKey(loginTokenHash), nonceHash, {
          nx: true,
          ex: NONCE_TTL_SECONDS,
        });
      } catch {
        throw new NonceStoreUnavailableError();
      }
      if (stored !== "OK") throw new NonceStoreUnavailableError();
      return { loginToken, nonce, createdAt: new Date().toISOString() };
    },
    async peek(loginToken) {
      const loginTokenHash = sha256(loginToken);
      let nonceHash: string | null;
      try {
        nonceHash = await redis.get<string>(redisKey(loginTokenHash));
      } catch {
        throw new NonceStoreUnavailableError();
      }
      return nonceHash === null ? null : { nonceHash };
    },
    async consumeIfMatches(loginToken, expectedNonceHash) {
      const loginTokenHash = sha256(loginToken);
      let result: number;
      try {
        result = (await redis.eval(
          CONSUME_SCRIPT,
          [redisKey(loginTokenHash)],
          [expectedNonceHash],
        )) as number;
      } catch {
        throw new NonceStoreUnavailableError();
      }
      return result === 1;
    },
    async discard(loginToken) {
      const loginTokenHash = sha256(loginToken);
      try {
        await redis.del(redisKey(loginTokenHash));
      } catch {
        throw new NonceStoreUnavailableError();
      }
    },
  };
}
