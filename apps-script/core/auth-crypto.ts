export interface SecureRandom {
  bytes(length: number): Uint8Array;
  base64Url(bytes: Uint8Array): string;
}
export interface CryptoAdapter {
  sha256(value: string): string;
  hmacSha256(secret: string, value: string): string;
}

export function createOpaqueToken(random: SecureRandom, length = 32): string {
  if (!Number.isInteger(length) || length !== 32)
    throw new Error("Invalid token length.");
  const value = random.base64Url(random.bytes(length));
  if (!isCanonicalBase64Url(value, length))
    throw new Error("Invalid random token.");
  return value;
}
export function hashSecret(
  crypto: CryptoAdapter,
  pepper: string,
  secret: string,
): string {
  return crypto.hmacSha256(pepper, secret);
}
const BASE64URL = /^[A-Za-z0-9_-]*$/;
export function decodeBase64Url(
  value: string,
  exactBytes?: number,
): Uint8Array | null {
  if (!BASE64URL.test(value) || value.includes("=") || value.length % 4 === 1)
    return null;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let accumulator = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const character of value) {
    accumulator = (accumulator << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
    }
  }
  if (bits > 0 && (accumulator & ((1 << bits) - 1)) !== 0) return null;
  const output = new Uint8Array(bytes);
  return exactBytes === undefined || output.length === exactBytes
    ? output
    : null;
}
export function encodeBase64Url(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += alphabet[(accumulator >> bits) & 63];
    }
  }
  return bits ? out + alphabet[(accumulator << (6 - bits)) & 63] : out;
}
export function isCanonicalBase64Url(
  value: string,
  exactBytes?: number,
): boolean {
  const bytes = decodeBase64Url(value, exactBytes);
  return bytes !== null && encodeBase64Url(bytes) === value;
}
export function signingInput(input: {
  keyId: string;
  audience: string;
  issuedAt: string;
  expiresAt: string;
  jti: string;
  method: string;
  path: string;
  bodyDigest: string;
}): string {
  return [
    "v1",
    input.keyId,
    input.audience,
    input.issuedAt,
    input.expiresAt,
    input.jti,
    input.method,
    input.path,
    input.bodyDigest,
  ].join("\n");
}
export function constantTimeEquals(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1)
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}
export function verifyInternalRequest(
  crypto: CryptoAdapter,
  secret: string,
  digest: string,
  signature: string,
): boolean {
  return constantTimeEquals(crypto.hmacSha256(secret, digest), signature);
}
