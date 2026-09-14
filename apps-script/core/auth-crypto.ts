export interface SecureRandom {
  bytes(length: number): Uint8Array;
  base64Url(bytes: Uint8Array): string;
}
export interface CryptoAdapter {
  sha256(value: string): string;
  hmacSha256(secret: string, value: string): string;
}

export function createOpaqueToken(random: SecureRandom, length = 32): string {
  if (!Number.isInteger(length) || length < 32)
    throw new Error("Invalid token length.");
  return random.base64Url(random.bytes(length));
}
export function hashSecret(crypto: CryptoAdapter, secret: string): string {
  return crypto.sha256(secret);
}
export function canonicalRequestDigest(
  crypto: CryptoAdapter,
  input: {
    method: string;
    path: string;
    audience: string;
    issuedAt: string;
    jti: string;
    body: string;
  },
): string {
  return crypto.sha256(
    [
      input.method.toUpperCase(),
      input.path,
      input.audience,
      input.issuedAt,
      input.jti,
      input.body,
    ].join("\n"),
  );
}
export function signInternalRequest(
  crypto: CryptoAdapter,
  secret: string,
  digest: string,
): string {
  return crypto.hmacSha256(secret, digest);
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
  return constantTimeEquals(
    signInternalRequest(crypto, secret, digest),
    signature,
  );
}
