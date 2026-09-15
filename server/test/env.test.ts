import { describe, expect, it } from "vitest";

import { EnvValidationError, loadServerAuthEnv } from "../auth/env";

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
    APPS_SCRIPT_INTERNAL_URL: "https://script.google.com/macros/s/abc/exec",
    INTERNAL_AUDIENCE: "hotech-internal",
    INTERNAL_HMAC_KEYS_JSON: JSON.stringify({
      "key-1": { secret: "s".repeat(32), status: "active" },
    }),
    INTERNAL_HMAC_ACTIVE_KEY_ID: "key-1",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token-value",
    RATE_LIMIT_KEY_SECRET: "r".repeat(32),
    APP_ORIGIN: "https://app.example.com",
    ...overrides,
  };
}

describe("server env validation", () => {
  it("accepts a fully valid environment", () => {
    expect(() => loadServerAuthEnv(validEnv())).not.toThrow();
  });

  it("fails closed when a required key is missing", () => {
    const env = validEnv();
    delete env.GOOGLE_CLIENT_ID;
    expect(() => loadServerAuthEnv(env)).toThrow(EnvValidationError);
  });

  it("fails closed when APPS_SCRIPT_INTERNAL_URL is not https", () => {
    expect(() =>
      loadServerAuthEnv(
        validEnv({ APPS_SCRIPT_INTERNAL_URL: "http://insecure.example.com" }),
      ),
    ).toThrow(EnvValidationError);
  });

  it("fails closed when the active key id is not present or not active", () => {
    expect(() =>
      loadServerAuthEnv(
        validEnv({ INTERNAL_HMAC_ACTIVE_KEY_ID: "missing-key" }),
      ),
    ).toThrow(EnvValidationError);
  });

  it("fails closed when a key secret is too short", () => {
    expect(() =>
      loadServerAuthEnv(
        validEnv({
          INTERNAL_HMAC_KEYS_JSON: JSON.stringify({
            "key-1": { secret: "short", status: "active" },
          }),
        }),
      ),
    ).toThrow(EnvValidationError);
  });

  it("fails closed when RATE_LIMIT_KEY_SECRET is too short", () => {
    expect(() =>
      loadServerAuthEnv(validEnv({ RATE_LIMIT_KEY_SECRET: "short" })),
    ).toThrow(EnvValidationError);
  });

  it("fails closed when INTERNAL_HMAC_KEYS_JSON is malformed", () => {
    expect(() =>
      loadServerAuthEnv(validEnv({ INTERNAL_HMAC_KEYS_JSON: "not-json" })),
    ).toThrow(EnvValidationError);
  });
});
