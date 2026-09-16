import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../auth/password-hash";

describe("password hashing/verification (D-050 batch 1)", () => {
  it("hashes and verifies a correct Argon2id password", async () => {
    const result = await hashPassword("Correct Horse Battery Staple 1!");
    expect(result.algo).toBe("argon2id");
    expect(result.hash.length).toBeGreaterThan(0);

    const ok = await verifyPassword(
      "Correct Horse Battery Staple 1!",
      result.algo,
      result.hash,
      result.params,
    );
    expect(ok).toBe(true);
  });

  it("rejects an incorrect password against an Argon2id hash", async () => {
    const result = await hashPassword("the-real-password");
    const ok = await verifyPassword(
      "not-the-real-password",
      result.algo,
      result.hash,
      result.params,
    );
    expect(ok).toBe(false);
  });

  it("produces different hashes for the same password (per-hash random salt)", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first.hash).not.toBe(second.hash);
  });

  it("verifies using the row's own recorded scrypt params, not a caller default", async () => {
    // Exercises the scrypt path directly to prove verification is
    // params-driven, independent of whether Argon2id is available.
    const { verifyPassword: verify } = await import("../auth/password-hash");
    const crypto = await import("node:crypto");
    const salt = Buffer.alloc(16, 1);
    const derived = crypto.scryptSync("a-password", salt, 32, {
      N: 1024,
      r: 8,
      p: 1,
    });
    const hash = `${salt.toString("base64")}:${derived.toString("base64")}`;
    const params = JSON.stringify({ N: 1024, r: 8, p: 1, keyLength: 32 });

    expect(await verify("a-password", "scrypt", hash, params)).toBe(true);
    expect(await verify("wrong-password", "scrypt", hash, params)).toBe(false);
  });
});
