import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Byte-for-byte port of apps-script/core/auth-crypto.ts base64url and
 * signing-input logic. Any divergence here breaks Phase 03B compatibility.
 */

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function decodeBase64Url(
  value: string,
  exactBytes?: number,
): Uint8Array | null {
  if (!BASE64URL.test(value) || value.includes("=") || value.length % 4 === 1)
    return null;
  const bytes = Buffer.from(value, "base64url");
  if (encodeBase64Url(bytes) !== value) return null;
  return exactBytes === undefined || bytes.length === exactBytes
    ? new Uint8Array(bytes)
    : null;
}

export function isCanonicalBase64Url(
  value: string,
  exactBytes?: number,
): boolean {
  return decodeBase64Url(value, exactBytes) !== null;
}

export function randomToken(length = 32): string {
  if (!Number.isInteger(length) || length !== 32)
    throw new Error("Invalid token length.");
  const value = encodeBase64Url(randomBytes(length));
  if (!isCanonicalBase64Url(value, length))
    throw new Error("Invalid random token.");
  return value;
}

export function randomJti(length = 16): string {
  if (!Number.isInteger(length) || length < 16)
    throw new Error("Invalid JTI length.");
  return encodeBase64Url(randomBytes(length));
}

export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function hmacSha256Base64Url(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

export function constantTimeEquals(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1)
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}

export function hashSecret(pepper: string, secret: string): string {
  return hmacSha256Base64Url(pepper, secret);
}

export interface CryptoAdapter {
  sha256(value: string): string;
  hmacSha256(secret: string, value: string): string;
}

export const nodeCryptoAdapter: CryptoAdapter = {
  sha256: sha256Base64Url,
  hmacSha256: hmacSha256Base64Url,
};
