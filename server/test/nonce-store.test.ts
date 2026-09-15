import type { Redis } from "@upstash/redis";
import { describe, expect, it } from "vitest";

import { sha256Base64Url, randomToken } from "../auth/crypto";
import {
  createUpstashNonceStore,
  NonceStoreUnavailableError,
} from "../auth/nonce-store";
import { FakeRedis } from "./fakes/fake-redis";

function store(redis: FakeRedis) {
  return createUpstashNonceStore(
    redis as unknown as Redis,
    sha256Base64Url,
    randomToken,
  );
}

describe("nonce store", () => {
  it("creates a transaction whose nonce hash can be peeked", async () => {
    const redis = new FakeRedis();
    const s = store(redis);
    const tx = await s.create();
    const peeked = await s.peek(tx.loginToken);
    expect(peeked?.nonceHash).toBe(sha256Base64Url(tx.nonce));
  });

  it("consumes the transaction exactly once (single-use)", async () => {
    const redis = new FakeRedis();
    const s = store(redis);
    const tx = await s.create();
    const hash = sha256Base64Url(tx.nonce);
    const first = await s.consumeIfMatches(tx.loginToken, hash);
    const second = await s.consumeIfMatches(tx.loginToken, hash);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("rejects consumption with a mismatched hash (replay/tamper attempt)", async () => {
    const redis = new FakeRedis();
    const s = store(redis);
    const tx = await s.create();
    const consumed = await s.consumeIfMatches(tx.loginToken, "wrong-hash");
    expect(consumed).toBe(false);
    // The transaction must still be consumable with the correct hash.
    const correct = await s.consumeIfMatches(
      tx.loginToken,
      sha256Base64Url(tx.nonce),
    );
    expect(correct).toBe(true);
  });

  it("treats an expired transaction as absent", async () => {
    const redis = new FakeRedis();
    const s = store(redis);
    const tx = await s.create();
    redis.expireNow(`hotech:auth:login:${sha256Base64Url(tx.loginToken)}`);
    const peeked = await s.peek(tx.loginToken);
    expect(peeked).toBeNull();
    const consumed = await s.consumeIfMatches(
      tx.loginToken,
      sha256Base64Url(tx.nonce),
    );
    expect(consumed).toBe(false);
  });

  it("only allows one winner under concurrent consumption attempts", async () => {
    const redis = new FakeRedis();
    const s = store(redis);
    const tx = await s.create();
    const hash = sha256Base64Url(tx.nonce);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => s.consumeIfMatches(tx.loginToken, hash)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("discard removes the transaction", async () => {
    const redis = new FakeRedis();
    const s = store(redis);
    const tx = await s.create();
    await s.discard(tx.loginToken);
    expect(await s.peek(tx.loginToken)).toBeNull();
  });

  it("fails closed when the underlying store errors", async () => {
    const redis = new FakeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (redis as any).set = async () => {
      throw new Error("network error");
    };
    const s = store(redis);
    await expect(s.create()).rejects.toThrow(NonceStoreUnavailableError);
  });
});
