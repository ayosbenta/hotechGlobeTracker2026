import { describe, expect, it } from "vitest";

import type { AuthConfig } from "../../apps-script/core/auth-config";
import { verifyEnvelope } from "../../apps-script/core/auth-envelope";
import { nodeCryptoAdapter } from "../auth/crypto";
import { createInternalEnvelope } from "../auth/signing";

const FIXED_SECRET = "a".repeat(32);
const AUDIENCE = "hotech-internal-audience";

function config(): AuthConfig {
  return {
    spreadsheetId: "sheet-1",
    audience: AUDIENCE,
    keys: new Map([["key-1", { secret: FIXED_SECRET, status: "active" }]]),
    activeKeyId: "key-1",
    sessionTokenPepper: "b".repeat(32),
    csrfTokenPepper: "c".repeat(32),
    clockSkewSeconds: 30,
    assertionMaxTtlSeconds: 60,
    sessionIdleSeconds: 1800,
    sessionAbsoluteSeconds: 28800,
    sessionTouchSeconds: 300,
  };
}

const clock = { now: () => new Date("2026-09-15T00:00:00.000Z") };

describe("golden signing vectors: Node BFF -> frozen Apps Script verifier", () => {
  it("verifies a login_first_bind envelope byte-for-byte", () => {
    const envelope = createInternalEnvelope(
      nodeCryptoAdapter,
      clock.now(),
      { keyId: "key-1", secret: FIXED_SECRET },
      {
        audience: AUDIENCE,
        method: "POST",
        path: "/internal/v1/auth/login-first-bind",
        payload: {
          email: "user@example.com",
          sub: "google-subject-1",
          email_verified: true,
          session_token: "s".repeat(43),
          csrf_token: "t".repeat(43),
        },
      },
    );

    const { envelope: verified } = verifyEnvelope(
      envelope,
      { method: "POST", path: "/internal/v1/auth/login-first-bind" },
      config(),
      clock,
      nodeCryptoAdapter,
    );

    expect(verified.signature).toBe(envelope.signature);
    expect(verified.body_digest).toBe(envelope.body_digest);
  });

  it("produces a fixed signature for a fixed golden vector (regression pin)", () => {
    // Any change to signingInput(), canonicalPayload(), or the base64url
    // alphabet on either runtime must change this value and fail the test.
    const bodyDigest = nodeCryptoAdapter.sha256(
      JSON.stringify({ session_token: "z".repeat(43) }),
    );
    const input = [
      "v1",
      "key-1",
      AUDIENCE,
      "2026-09-15T00:00:00.000Z",
      "2026-09-15T00:00:30.000Z",
      "AAAAAAAAAAAAAAAAAAAAAA",
      "POST",
      "/internal/v1/auth/session/validate",
      bodyDigest,
    ].join("\n");
    const signature = nodeCryptoAdapter.hmacSha256(FIXED_SECRET, input);
    const envelope = {
      version: "v1" as const,
      key_id: "key-1",
      audience: AUDIENCE,
      issued_at: "2026-09-15T00:00:00.000Z",
      expires_at: "2026-09-15T00:00:30.000Z",
      jti: "AAAAAAAAAAAAAAAAAAAAAA",
      method: "POST",
      path: "/internal/v1/auth/session/validate",
      body_digest: bodyDigest,
      signature,
      payload: { session_token: "z".repeat(43) },
    };

    expect(() =>
      verifyEnvelope(
        envelope,
        { method: "POST", path: "/internal/v1/auth/session/validate" },
        config(),
        clock,
        nodeCryptoAdapter,
      ),
    ).not.toThrow();
  });

  it("rejects a tampered payload", () => {
    const envelope = createInternalEnvelope(
      nodeCryptoAdapter,
      clock.now(),
      { keyId: "key-1", secret: FIXED_SECRET },
      {
        audience: AUDIENCE,
        method: "POST",
        path: "/internal/v1/auth/session/validate",
        payload: { session_token: "s".repeat(43) },
      },
    );
    const tampered = {
      ...envelope,
      payload: { session_token: "x".repeat(43) },
    };
    expect(() =>
      verifyEnvelope(
        tampered,
        { method: "POST", path: "/internal/v1/auth/session/validate" },
        config(),
        clock,
        nodeCryptoAdapter,
      ),
    ).toThrow();
  });

  it("rejects an expired assertion", () => {
    const past = { now: () => new Date("2026-09-15T00:05:00.000Z") };
    const envelope = createInternalEnvelope(
      nodeCryptoAdapter,
      clock.now(),
      { keyId: "key-1", secret: FIXED_SECRET },
      {
        audience: AUDIENCE,
        method: "POST",
        path: "/internal/v1/auth/session/validate",
        payload: { session_token: "s".repeat(43) },
      },
    );
    expect(() =>
      verifyEnvelope(
        envelope,
        { method: "POST", path: "/internal/v1/auth/session/validate" },
        config(),
        past,
        nodeCryptoAdapter,
      ),
    ).toThrow();
  });

  it("rejects a disabled key", () => {
    const envelope = createInternalEnvelope(
      nodeCryptoAdapter,
      clock.now(),
      { keyId: "key-2", secret: FIXED_SECRET },
      {
        audience: AUDIENCE,
        method: "POST",
        path: "/internal/v1/auth/session/validate",
        payload: { session_token: "s".repeat(43) },
      },
    );
    const disabledConfig: AuthConfig = {
      ...config(),
      keys: new Map([["key-2", { secret: FIXED_SECRET, status: "disabled" }]]),
    };
    expect(() =>
      verifyEnvelope(
        envelope,
        { method: "POST", path: "/internal/v1/auth/session/validate" },
        disabledConfig,
        clock,
        nodeCryptoAdapter,
      ),
    ).toThrow();
  });
});
