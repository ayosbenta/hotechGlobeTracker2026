import { describe, expect, it } from "vitest";

import {
  constantTimeEquals,
  decodeBase64Url,
  encodeBase64Url,
  isCanonicalBase64Url,
  randomJti,
  randomToken,
} from "../auth/crypto";

describe("crypto primitives", () => {
  it("round-trips base64url encode/decode", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const encoded = encodeBase64Url(bytes);
    expect(encoded.includes("=")).toBe(false);
    expect(decodeBase64Url(encoded)).toEqual(bytes);
  });

  it("rejects non-canonical base64url (padding, wrong alphabet)", () => {
    expect(isCanonicalBase64Url("abc=")).toBe(false);
    expect(isCanonicalBase64Url("abc+")).toBe(false);
    expect(isCanonicalBase64Url("a")).toBe(false);
  });

  it("randomToken always returns 32 canonical bytes", () => {
    const token = randomToken(32);
    expect(isCanonicalBase64Url(token, 32)).toBe(true);
  });

  it("randomToken rejects non-32 lengths", () => {
    expect(() => randomToken(16)).toThrow();
  });

  it("randomJti returns at least 16 bytes of entropy", () => {
    const jti = randomJti(16);
    expect(decodeBase64Url(jti)?.length).toBeGreaterThanOrEqual(16);
  });

  it("constantTimeEquals is correct for equal and unequal strings", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
  });
});
