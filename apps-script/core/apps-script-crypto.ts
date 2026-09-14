import type { CryptoAdapter } from "./auth-crypto";

export interface AppsScriptCryptoUtilities {
  computeDigest(algorithm: unknown, value: string, charset: unknown): number[];
  computeHmacSha256Signature(value: string, secret: string): number[];
  base64EncodeWebSafe(bytes: number[]): string;
  DigestAlgorithm: { SHA_256: unknown };
  Charset: { UTF_8: unknown };
}

function unsigned(bytes: number[]): number[] {
  return bytes.map((value) => (value < 0 ? value + 256 : value));
}
export function createAppsScriptCrypto(
  utilities: AppsScriptCryptoUtilities,
): CryptoAdapter {
  return {
    sha256: (value) =>
      utilities
        .base64EncodeWebSafe(
          unsigned(
            utilities.computeDigest(
              utilities.DigestAlgorithm.SHA_256,
              value,
              utilities.Charset.UTF_8,
            ),
          ),
        )
        .replace(/=/g, ""),
    hmacSha256: (secret, value) =>
      utilities
        .base64EncodeWebSafe(
          unsigned(utilities.computeHmacSha256Signature(value, secret)),
        )
        .replace(/=/g, ""),
  };
}
