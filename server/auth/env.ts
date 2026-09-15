export type HmacKeyStatus = "active" | "retiring" | "disabled";
export interface HmacKey {
  secret: string;
  status: HmacKeyStatus;
}

export interface ServerAuthEnv {
  googleClientId: string;
  appsScriptInternalUrl: string;
  /**
   * MVP-2A: the Apps Script Web App's internal-CRUD ingress URL
   * (`.../exec/v1/internal/crud`), a sibling route on the same deployment as
   * `appsScriptInternalUrl`'s `.../exec/v1/internal/auth`. Reuses the same
   * HMAC key ring/audience — it is not a separate trust boundary.
   */
  appsScriptCrudUrl: string;
  internalAudience: string;
  internalHmacKeys: ReadonlyMap<string, HmacKey>;
  internalHmacActiveKeyId: string;
  upstashRedisRestUrl: string;
  upstashRedisRestToken: string;
  rateLimitKeySecret: string;
  appOrigin: string;
}

export class EnvValidationError extends Error {
  constructor() {
    super("Server environment configuration is invalid.");
    this.name = "EnvValidationError";
  }
}

const REQUIRED_SERVER_KEYS = [
  "GOOGLE_CLIENT_ID",
  "APPS_SCRIPT_INTERNAL_URL",
  "APPS_SCRIPT_CRUD_URL",
  "INTERNAL_AUDIENCE",
  "INTERNAL_HMAC_KEYS_JSON",
  "INTERNAL_HMAC_ACTIVE_KEY_ID",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RATE_LIMIT_KEY_SECRET",
  "APP_ORIGIN",
] as const;

function required(
  source: Record<string, string | undefined>,
  key: string,
): string {
  const value = source[key]?.trim();
  if (!value) throw new EnvValidationError();
  return value;
}

function httpsUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new EnvValidationError();
  }
  if (parsed.protocol !== "https:") throw new EnvValidationError();
  return value;
}

function keyRing(raw: string): ReadonlyMap<string, HmacKey> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EnvValidationError();
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")
    throw new EnvValidationError();
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 16)
    throw new EnvValidationError();
  const result = new Map<string, HmacKey>();
  for (const [id, value] of entries) {
    if (
      !/^[A-Za-z0-9._-]{1,128}$/.test(id) ||
      value === null ||
      Array.isArray(value) ||
      typeof value !== "object"
    )
      throw new EnvValidationError();
    const item = value as Record<string, unknown>;
    if (
      Object.keys(item).length !== 2 ||
      typeof item.secret !== "string" ||
      item.secret.length < 32 ||
      !["active", "retiring", "disabled"].includes(String(item.status)) ||
      result.has(id)
    )
      throw new EnvValidationError();
    result.set(id, {
      secret: item.secret,
      status: item.status as HmacKeyStatus,
    });
  }
  return result;
}

/**
 * Validates the server-only environment without ever reading or trusting a
 * VITE_-prefixed variable. Fails closed on any missing/malformed value.
 */
export function loadServerAuthEnv(
  source: Record<string, string | undefined> = process.env,
): ServerAuthEnv {
  for (const key of REQUIRED_SERVER_KEYS) required(source, key);
  for (const key of Object.keys(source)) {
    if (key.startsWith("VITE_") && REQUIRED_SERVER_KEYS.includes(key as never))
      throw new EnvValidationError();
  }

  const googleClientId = required(source, "GOOGLE_CLIENT_ID");
  if (!/^[A-Za-z0-9.-]{8,255}$/.test(googleClientId))
    throw new EnvValidationError();

  const appsScriptInternalUrl = httpsUrl(
    required(source, "APPS_SCRIPT_INTERNAL_URL"),
  );
  const appsScriptCrudUrl = httpsUrl(required(source, "APPS_SCRIPT_CRUD_URL"));

  const internalAudience = required(source, "INTERNAL_AUDIENCE");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(internalAudience))
    throw new EnvValidationError();

  const internalHmacKeys = keyRing(required(source, "INTERNAL_HMAC_KEYS_JSON"));
  const internalHmacActiveKeyId = required(
    source,
    "INTERNAL_HMAC_ACTIVE_KEY_ID",
  );
  if (internalHmacKeys.get(internalHmacActiveKeyId)?.status !== "active")
    throw new EnvValidationError();

  const upstashRedisRestUrl = httpsUrl(
    required(source, "UPSTASH_REDIS_REST_URL"),
  );
  const upstashRedisRestToken = required(source, "UPSTASH_REDIS_REST_TOKEN");

  const rateLimitKeySecret = required(source, "RATE_LIMIT_KEY_SECRET");
  if (rateLimitKeySecret.length < 32) throw new EnvValidationError();

  const appOrigin = httpsUrl(required(source, "APP_ORIGIN"));

  return {
    googleClientId,
    appsScriptInternalUrl,
    appsScriptCrudUrl,
    internalAudience,
    internalHmacKeys,
    internalHmacActiveKeyId,
    upstashRedisRestUrl,
    upstashRedisRestToken,
    rateLimitKeySecret,
    appOrigin,
  };
}
