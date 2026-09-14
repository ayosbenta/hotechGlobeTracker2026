import {
  ConfigurationError,
  loadServerConfig,
  type ScriptProperties,
} from "./config";

export type HmacKeyStatus = "active" | "retiring" | "disabled";
export interface HmacKey {
  secret: string;
  status: HmacKeyStatus;
}
export interface AuthConfig {
  spreadsheetId: string;
  audience: string;
  keys: ReadonlyMap<string, HmacKey>;
  activeKeyId: string;
  sessionTokenPepper: string;
  csrfTokenPepper: string;
  clockSkewSeconds: 30;
  assertionMaxTtlSeconds: 60;
  sessionIdleSeconds: 1800;
  sessionAbsoluteSeconds: 28800;
  sessionTouchSeconds: 300;
}

function required(properties: ScriptProperties, key: string): string {
  const value = properties.getProperty(key)?.trim();
  if (!value) throw new ConfigurationError();
  return value;
}
function exactInteger<T extends number>(
  properties: ScriptProperties,
  key: string,
  expected: T,
): T {
  if (required(properties, key) !== String(expected))
    throw new ConfigurationError();
  return expected;
}
function keyRing(raw: string): ReadonlyMap<string, HmacKey> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigurationError();
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")
    throw new ConfigurationError();
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 16)
    throw new ConfigurationError();
  const result = new Map<string, HmacKey>();
  for (const [id, value] of entries) {
    if (
      !/^[A-Za-z0-9._-]{1,128}$/.test(id) ||
      value === null ||
      Array.isArray(value) ||
      typeof value !== "object"
    )
      throw new ConfigurationError();
    const item = value as Record<string, unknown>;
    if (
      Object.keys(item).length !== 2 ||
      typeof item.secret !== "string" ||
      item.secret.length < 32 ||
      !["active", "retiring", "disabled"].includes(String(item.status)) ||
      result.has(id)
    )
      throw new ConfigurationError();
    result.set(id, {
      secret: item.secret,
      status: item.status as HmacKeyStatus,
    });
  }
  return result;
}

/** Validates auth settings without exposing any setting value in errors. */
export function loadAuthConfig(properties: ScriptProperties): AuthConfig {
  const server = loadServerConfig(properties);
  if (required(properties, "AUTH_SCHEMA_VERSION") !== "phase-03a-v1")
    throw new ConfigurationError();
  const audience = required(properties, "INTERNAL_AUDIENCE");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(audience))
    throw new ConfigurationError();
  const keys = keyRing(required(properties, "INTERNAL_HMAC_KEYS_JSON"));
  const activeKeyId = required(properties, "INTERNAL_HMAC_ACTIVE_KEY_ID");
  if (keys.get(activeKeyId)?.status !== "active")
    throw new ConfigurationError();
  const sessionTokenPepper = required(properties, "SESSION_TOKEN_PEPPER");
  const csrfTokenPepper = required(properties, "CSRF_TOKEN_PEPPER");
  if (
    sessionTokenPepper.length < 32 ||
    csrfTokenPepper.length < 32 ||
    sessionTokenPepper === csrfTokenPepper
  )
    throw new ConfigurationError();
  return {
    spreadsheetId: server.spreadsheetId,
    audience,
    keys,
    activeKeyId,
    sessionTokenPepper,
    csrfTokenPepper,
    clockSkewSeconds: exactInteger(
      properties,
      "INTERNAL_CLOCK_SKEW_SECONDS",
      30,
    ),
    assertionMaxTtlSeconds: exactInteger(
      properties,
      "INTERNAL_ASSERTION_MAX_TTL_SECONDS",
      60,
    ),
    sessionIdleSeconds: exactInteger(
      properties,
      "SESSION_IDLE_TTL_SECONDS",
      1800,
    ),
    sessionAbsoluteSeconds: exactInteger(
      properties,
      "SESSION_ABSOLUTE_TTL_SECONDS",
      28800,
    ),
    sessionTouchSeconds: exactInteger(
      properties,
      "SESSION_TOUCH_INTERVAL_SECONDS",
      300,
    ),
  };
}
