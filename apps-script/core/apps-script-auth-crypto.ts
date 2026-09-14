import { encodeBase64Url } from "./auth-crypto";
import type { CryptoAdapter } from "./auth-crypto";

export function appsScriptCrypto(utilities: {
  computeDigest(algorithm: unknown, value: string, charset: unknown): number[];
  computeHmacSha256Signature(value: string, secret: string): number[];
  DigestAlgorithm: { SHA_256: unknown };
  Charset: { UTF_8: unknown };
}): CryptoAdapter {
  const bytes = (value: number[]) =>
    new Uint8Array(value.map((entry) => entry & 255));
  return {
    sha256: (value) =>
      encodeBase64Url(
        bytes(
          utilities.computeDigest(
            utilities.DigestAlgorithm.SHA_256,
            value,
            utilities.Charset.UTF_8,
          ),
        ),
      ),
    hmacSha256: (secret, value) =>
      encodeBase64Url(
        bytes(utilities.computeHmacSha256Signature(value, secret)),
      ),
  };
}
