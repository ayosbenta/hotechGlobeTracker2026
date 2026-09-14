import type { AuthConfig } from "./auth-config";
import {
  decodeBase64Url,
  isCanonicalBase64Url,
  signingInput,
  verifyInternalRequest,
} from "./auth-crypto";
import type { Clock } from "./contracts";
import type { CryptoAdapter } from "./auth-crypto";

export interface InternalEnvelope {
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
export class EnvelopeError extends Error {
  constructor() {
    super("Invalid internal request.");
    this.name = "EnvelopeError";
  }
}
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const path = /^\/internal\/v1\/[A-Za-z0-9/-]+$/;

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new EnvelopeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value) || typeof value !== "object")
    throw new EnvelopeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}
export function canonicalPayload(value: unknown): string {
  if (value === null || Array.isArray(value) || typeof value !== "object")
    throw new EnvelopeError();
  return canonical(value);
}
function asEnvelope(value: unknown): InternalEnvelope {
  if (value === null || Array.isArray(value) || typeof value !== "object")
    throw new EnvelopeError();
  const item = value as Record<string, unknown>;
  const required = [
    "version",
    "key_id",
    "audience",
    "issued_at",
    "expires_at",
    "jti",
    "method",
    "path",
    "body_digest",
    "signature",
    "payload",
  ];
  if (
    Object.keys(item).length !== required.length ||
    required.some((key) => !(key in item)) ||
    required.slice(0, 10).some((key) => typeof item[key] !== "string")
  )
    throw new EnvelopeError();
  if (
    item.version !== "v1" ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(item.key_id as string) ||
    !/^[A-Z]+$/.test(item.method as string) ||
    !path.test(item.path as string)
  )
    throw new EnvelopeError();
  if (
    !timestamp.test(item.issued_at as string) ||
    !timestamp.test(item.expires_at as string) ||
    !isCanonicalBase64Url(item.jti as string) ||
    (decodeBase64Url(item.jti as string)?.length ?? 0) < 16 ||
    !isCanonicalBase64Url(item.body_digest as string, 32) ||
    !isCanonicalBase64Url(item.signature as string, 32)
  )
    throw new EnvelopeError();
  canonicalPayload(item.payload);
  return item as unknown as InternalEnvelope;
}
/** Validates every envelope field before any replay row can be consumed. */
export function verifyEnvelope(
  raw: unknown,
  expected: { method: string; path: string },
  config: AuthConfig,
  clock: Clock,
  crypto: CryptoAdapter,
): { envelope: InternalEnvelope; payloadJson: string } {
  const envelope = asEnvelope(raw);
  if (
    envelope.audience !== config.audience ||
    envelope.method !== expected.method ||
    envelope.path !== expected.path
  )
    throw new EnvelopeError();
  const issued = Date.parse(envelope.issued_at);
  const expires = Date.parse(envelope.expires_at);
  const now = clock.now().getTime();
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    expires <= issued ||
    expires - issued > config.assertionMaxTtlSeconds * 1000 ||
    issued > now + config.clockSkewSeconds * 1000 ||
    now > expires + config.clockSkewSeconds * 1000
  )
    throw new EnvelopeError();
  const key = config.keys.get(envelope.key_id);
  if (key === undefined || key.status === "disabled") throw new EnvelopeError();
  const payloadJson = canonicalPayload(envelope.payload);
  const actualDigest = crypto.sha256(payloadJson);
  if (
    !isCanonicalBase64Url(actualDigest, 32) ||
    actualDigest !== envelope.body_digest ||
    !verifyInternalRequest(
      crypto,
      key.secret,
      signingInput({
        keyId: envelope.key_id,
        audience: envelope.audience,
        issuedAt: envelope.issued_at,
        expiresAt: envelope.expires_at,
        jti: envelope.jti,
        method: envelope.method,
        path: envelope.path,
        bodyDigest: envelope.body_digest,
      }),
      envelope.signature,
    )
  )
    throw new EnvelopeError();
  return { envelope, payloadJson };
}
