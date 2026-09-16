import { randomJti } from "./crypto.js";
import type { CryptoAdapter } from "./crypto.js";

/**
 * Port of apps-script/core/auth-envelope.ts canonical() and signingInput().
 * Must stay byte-identical to the frozen Phase 03B verifier.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid canonical number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value) || typeof value !== "object")
    throw new Error("Invalid canonical value.");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function canonicalPayload(value: unknown): string {
  if (value === null || Array.isArray(value) || typeof value !== "object")
    throw new Error("Invalid canonical payload.");
  return canonicalJson(value);
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

export interface SignedEnvelope {
  version: "v1";
  key_id: string;
  audience: string;
  issued_at: string;
  expires_at: string;
  jti: string;
  method: string;
  path: string;
  body_digest: string;
  signature: string;
  payload: Record<string, unknown>;
}

export interface SigningKey {
  keyId: string;
  secret: string;
}

/** Assertion lifetime is fixed at 60s per the frozen Phase 03B contract. */
const ASSERTION_TTL_SECONDS = 60;

export function createInternalEnvelope(
  crypto: CryptoAdapter,
  now: Date,
  key: SigningKey,
  request: {
    audience: string;
    method: string;
    path: string;
    payload: Record<string, unknown>;
  },
): SignedEnvelope {
  const payloadJson = canonicalPayload(request.payload);
  const bodyDigest = crypto.sha256(payloadJson);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + ASSERTION_TTL_SECONDS * 1000,
  ).toISOString();
  const jti = randomJti(16);
  const input = signingInput({
    keyId: key.keyId,
    audience: request.audience,
    issuedAt,
    expiresAt,
    jti,
    method: request.method,
    path: request.path,
    bodyDigest,
  });
  const signature = crypto.hmacSha256(key.secret, input);
  return {
    version: "v1",
    key_id: key.keyId,
    audience: request.audience,
    issued_at: issuedAt,
    expires_at: expiresAt,
    jti,
    method: request.method,
    path: request.path,
    body_digest: bodyDigest,
    signature,
    payload: request.payload,
  };
}
