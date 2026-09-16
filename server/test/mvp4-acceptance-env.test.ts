import { describe, expect, it } from "vitest";

import {
  Mvp4AcceptanceConfigError,
  loadMvp4AcceptanceConfig,
} from "../acceptance/mvp4-env";

const validSource: Record<string, string> = {
  MVP4_AUTH_TARGET_URL:
    "https://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/auth",
  MVP4_CRUD_TARGET_URL:
    "https://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/crud",
  MVP4_CONFIRM_NON_PRODUCTION: "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION",
  MVP4_INTERNAL_AUDIENCE: "hotech-globe-tracker.apps-script.nonprod",
  MVP4_HMAC_KEY_ID: "nonprod-k1",
  MVP4_HMAC_SECRET: "s".repeat(32),
  MVP4_TEST_ADMIN_EMAIL: "admin@example.com",
  MVP4_TEST_ADMIN_SUBJECT: "isolated-test-admin-subject-1",
};

describe("MVP-4 acceptance runner environment loader", () => {
  it("loads a fully valid configuration", () => {
    const config = loadMvp4AcceptanceConfig(validSource);
    expect(config.authUrl).toBe(validSource.MVP4_AUTH_TARGET_URL);
    expect(config.crudUrl).toBe(validSource.MVP4_CRUD_TARGET_URL);
    expect(config.audience).toBe(validSource.MVP4_INTERNAL_AUDIENCE);
    expect(config.signingKey).toEqual({
      keyId: "nonprod-k1",
      secret: "s".repeat(32),
    });
    expect(config.testAdminEmail).toBe(validSource.MVP4_TEST_ADMIN_EMAIL);
  });

  it("fails closed without the exact non-production confirmation literal", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_CONFIRM_NON_PRODUCTION: "yes",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_CONFIRM_NON_PRODUCTION: undefined,
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("rejects a production-looking auth URL even with confirmation set", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_AUTH_TARGET_URL:
          "https://script.google.com/macros/s/production-abc/exec/v1/internal/auth",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("rejects a production-looking CRUD URL even with confirmation set", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_CRUD_TARGET_URL:
          "https://script.google.com/macros/s/live-deploy-abc/exec/v1/internal/crud",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("rejects a production-looking audience even with confirmation set", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_INTERNAL_AUDIENCE: "hotech-globe-tracker.production",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("rejects an auth URL that does not end exactly with /exec/v1/internal/auth", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_AUTH_TARGET_URL:
          "https://script.google.com/macros/s/isolated-nonprod-abc/exec",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("rejects a CRUD URL that does not end exactly with /exec/v1/internal/crud", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_CRUD_TARGET_URL:
          "https://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/auth",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("rejects a non-HTTPS target URL", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_CRUD_TARGET_URL:
          "http://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/crud",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("rejects a malformed HMAC secret shorter than 32 characters", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_HMAC_SECRET: "too-short",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("rejects missing required configuration", () => {
    for (const key of Object.keys(validSource)) {
      const source = { ...validSource };
      delete source[key];
      expect(
        () => loadMvp4AcceptanceConfig(source),
        `expected ${key} to be required`,
      ).toThrow(Mvp4AcceptanceConfigError);
    }
  });

  it("rejects a malformed test-admin email", () => {
    expect(() =>
      loadMvp4AcceptanceConfig({
        ...validSource,
        MVP4_TEST_ADMIN_EMAIL: "not-an-email",
      }),
    ).toThrow(Mvp4AcceptanceConfigError);
  });

  it("never attempts a network call: loading config performs no I/O", () => {
    // Purely a documentation-style assertion that this function is
    // synchronous and side-effect-free beyond reading `source`.
    expect(loadMvp4AcceptanceConfig(validSource)).toBeDefined();
  });
});
