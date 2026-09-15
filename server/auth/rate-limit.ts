import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

export type RateLimitBucket =
  | "nonce-minute"
  | "nonce-hour"
  | "login-ip"
  | "login-sub"
  | "me"
  | "csrf"
  | "logout"
  | "plans-read"
  | "plans-write";

export interface RateLimitOutcome {
  allowed: boolean;
}

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("Rate limiting is unavailable.");
    this.name = "RateLimitUnavailableError";
  }
}

export interface RateLimiter {
  check(bucket: RateLimitBucket, privacyKey: string): Promise<RateLimitOutcome>;
}

/**
 * All privacy keys must already be HMAC-derived by the caller
 * (see privacyKey()) before reaching this adapter; raw IP, email, sub, or
 * session tokens must never be used as a Redis key.
 */
export function createUpstashRateLimiter(redis: Redis): RateLimiter {
  const limiters: Record<RateLimitBucket, Ratelimit> = {
    "nonce-minute": new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:nonce-minute",
      limiter: Ratelimit.slidingWindow(10, "1 m"),
    }),
    "nonce-hour": new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:nonce-hour",
      limiter: Ratelimit.slidingWindow(50, "1 h"),
    }),
    "login-ip": new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:login-ip",
      limiter: Ratelimit.slidingWindow(5, "10 m"),
    }),
    "login-sub": new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:login-sub",
      limiter: Ratelimit.slidingWindow(10, "1 h"),
    }),
    me: new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:me",
      limiter: Ratelimit.slidingWindow(60, "1 m"),
    }),
    csrf: new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:csrf",
      limiter: Ratelimit.slidingWindow(20, "1 m"),
    }),
    logout: new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:logout",
      limiter: Ratelimit.slidingWindow(10, "1 m"),
    }),
    "plans-read": new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:plans-read",
      limiter: Ratelimit.slidingWindow(60, "1 m"),
    }),
    "plans-write": new Ratelimit({
      redis,
      analytics: false,
      prefix: "hotech:rl:plans-write",
      limiter: Ratelimit.slidingWindow(20, "1 m"),
    }),
  };
  return {
    async check(bucket, privacyKey) {
      try {
        const result = await limiters[bucket].limit(privacyKey);
        return { allowed: result.success };
      } catch {
        throw new RateLimitUnavailableError();
      }
    },
  };
}

export function privacyKey(
  secret: string,
  hmac: (secret: string, value: string) => string,
  value: string,
): string {
  return hmac(secret, value);
}

interface CryptoLike {
  hmacSha256(secret: string, value: string): string;
}

/** Binds privacyKey() to a RouteDependencies-shaped crypto adapter, avoiding a repeated closure at every call site. */
export function privacyKeyFor(
  deps: { rateLimitKeySecret: string; crypto: CryptoLike },
  value: string,
): string {
  return privacyKey(
    deps.rateLimitKeySecret,
    (secret, v) => deps.crypto.hmacSha256(secret, v),
    value,
  );
}
