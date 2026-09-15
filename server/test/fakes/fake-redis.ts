interface StoredValue {
  value: string;
  expiresAt: number | null;
}

/**
 * Minimal in-memory stand-in for the subset of the Upstash Redis REST client
 * used by the nonce store and rate limiter: GET/SET NX EX, DEL, and a Lua
 * EVAL restricted to the exact compare-and-delete script this module uses.
 */
export class FakeRedis {
  private readonly store = new Map<string, StoredValue>();

  private isLive(entry: StoredValue | undefined): entry is StoredValue {
    if (entry === undefined) return false;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      return false;
    }
    return true;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!this.isLive(entry)) return null;
    return entry.value as unknown as T;
  }

  async set(
    key: string,
    value: string,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<string | null> {
    const existing = this.store.get(key);
    if (opts?.nx && this.isLive(existing)) return null;
    this.store.set(key, {
      value,
      expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : null,
    });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count += 1;
    }
    return count;
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    // Only the compare-and-delete script used by createUpstashNonceStore is
    // supported; anything else indicates an unexpected call in a test.
    if (!script.includes('redis.call("DEL"')) {
      throw new Error("Unsupported EVAL script in FakeRedis.");
    }
    const key = keys[0];
    const expected = args[0];
    const entry = this.store.get(key);
    if (!this.isLive(entry) || entry.value !== expected) return 0;
    this.store.delete(key);
    return 1;
  }

  expireNow(key: string): void {
    const entry = this.store.get(key);
    if (entry) entry.expiresAt = Date.now() - 1;
  }
}
