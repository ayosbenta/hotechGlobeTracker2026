import { describe, expect, it } from "vitest";

import { AcceptanceConfigError, loadAcceptanceConfig } from "../acceptance/env";

const validSource: Record<string, string> = {
  PHASE_03C1A_TARGET_URL:
    "https://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/auth",
  PHASE_03C1A_CONFIRM_NON_PRODUCTION: "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION",
  PHASE_03C1A_INTERNAL_AUDIENCE: "hotech-globe-tracker.apps-script.nonprod",
  PHASE_03C1A_HMAC_KEY_ID: "nonprod-k1",
  PHASE_03C1A_HMAC_SECRET: "s".repeat(32),
  PHASE_03C1A_TEST_USER_EMAIL: "agent@example.com",
  PHASE_03C1A_TEST_USER_SUBJECT: "isolated-test-subject-1",
};

describe("Phase 03C1A acceptance runner environment loader", () => {
  it("loads a fully valid configuration", () => {
    const config = loadAcceptanceConfig(validSource);
    expect(config.internalUrl).toBe(validSource.PHASE_03C1A_TARGET_URL);
    expect(config.audience).toBe(validSource.PHASE_03C1A_INTERNAL_AUDIENCE);
    expect(config.signingKey).toEqual({
      keyId: "nonprod-k1",
      secret: "s".repeat(32),
    });
  });

  it("fails closed without the exact non-production confirmation literal", () => {
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_CONFIRM_NON_PRODUCTION: "yes",
      }),
    ).toThrow(AcceptanceConfigError);
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_CONFIRM_NON_PRODUCTION: undefined,
      }),
    ).toThrow(AcceptanceConfigError);
  });

  it("rejects a production-looking target URL even with confirmation set", () => {
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_TARGET_URL:
          "https://script.google.com/macros/s/production-abc/exec/v1/internal/auth",
      }),
    ).toThrow(AcceptanceConfigError);
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_TARGET_URL:
          "https://script.google.com/macros/s/live-deploy-abc/exec/v1/internal/auth",
      }),
    ).toThrow(AcceptanceConfigError);
  });

  it("rejects a production-looking audience even with confirmation set", () => {
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_INTERNAL_AUDIENCE: "hotech-globe-tracker.production",
      }),
    ).toThrow(AcceptanceConfigError);
  });

  it("rejects a URL that does not end exactly with /exec/v1/internal/auth", () => {
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_TARGET_URL:
          "https://script.google.com/macros/s/isolated-nonprod-abc/exec",
      }),
    ).toThrow(AcceptanceConfigError);
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_TARGET_URL:
          "https://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/auth/",
      }),
    ).toThrow(AcceptanceConfigError);
  });

  it("rejects a non-HTTPS target URL", () => {
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_TARGET_URL:
          "http://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/auth",
      }),
    ).toThrow(AcceptanceConfigError);
  });

  it("rejects a malformed HMAC secret shorter than 32 characters", () => {
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_HMAC_SECRET: "too-short",
      }),
    ).toThrow(AcceptanceConfigError);
  });

  it("rejects missing required configuration", () => {
    for (const key of Object.keys(validSource)) {
      const source = { ...validSource };
      delete source[key];
      expect(
        () => loadAcceptanceConfig(source),
        `expected ${key} to be required`,
      ).toThrow(AcceptanceConfigError);
    }
  });

  it("rejects a malformed test-user email", () => {
    expect(() =>
      loadAcceptanceConfig({
        ...validSource,
        PHASE_03C1A_TEST_USER_EMAIL: "not-an-email",
      }),
    ).toThrow(AcceptanceConfigError);
  });
});
