import {
  ConfigurationError,
  loadServerConfig,
  type ScriptProperties,
} from "./config";

export interface AuthConfig {
  sessionIdleSeconds: 1800;
  sessionAbsoluteSeconds: 28800;
  sessionTouchSeconds: 300;
  internalRequestAudience: string;
  internalHmacKeyId: string;
  internalHmacSecret: string;
  clockSkewSeconds: number;
  replayRetentionSeconds: number;
}

function required(properties: ScriptProperties, key: string): string {
  const value = properties.getProperty(key)?.trim();
  if (!value) throw new ConfigurationError();
  return value;
}
function integer(properties: ScriptProperties, key: string): number {
  const raw = required(properties, key);
  if (!/^\d+$/.test(raw)) throw new ConfigurationError();
  return Number(raw);
}

/** Validates auth settings without exposing any setting value in errors. */
export function loadAuthConfig(properties: ScriptProperties): AuthConfig {
  loadServerConfig(properties);
  const idle = integer(properties, "AUTH_SESSION_IDLE_SECONDS");
  const absolute = integer(properties, "AUTH_SESSION_ABSOLUTE_SECONDS");
  const touch = integer(properties, "AUTH_SESSION_TOUCH_SECONDS");
  const audience = required(properties, "INTERNAL_REQUEST_AUDIENCE");
  const keyId = required(properties, "INTERNAL_HMAC_KEY_ID");
  const secret = required(properties, "INTERNAL_HMAC_SECRET");
  const skew = integer(properties, "INTERNAL_CLOCK_SKEW_SECONDS");
  const retention = integer(properties, "INTERNAL_REPLAY_RETENTION_SECONDS");
  if (
    idle !== 1800 ||
    absolute !== 28800 ||
    touch !== 300 ||
    !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/.*)?$/.test(audience) ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(keyId) ||
    secret.length < 32 ||
    skew > 300 ||
    retention < absolute + skew
  )
    throw new ConfigurationError();
  return {
    sessionIdleSeconds: 1800,
    sessionAbsoluteSeconds: 28800,
    sessionTouchSeconds: 300,
    internalRequestAudience: audience,
    internalHmacKeyId: keyId,
    internalHmacSecret: secret,
    clockSkewSeconds: skew,
    replayRetentionSeconds: retention,
  };
}
