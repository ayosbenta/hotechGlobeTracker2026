import { describe, expect, it } from "vitest";

import type { AcceptanceRunnerConfig } from "../acceptance/env";
import type { Fetcher } from "../acceptance/phase-03c1a-runner";
import { runPhase03C1AAcceptance } from "../acceptance/phase-03c1a-runner";
import { nodeCryptoAdapter } from "../auth/crypto";
import { signingInput } from "../auth/signing";

const config: AcceptanceRunnerConfig = {
  internalUrl:
    "https://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/auth",
  audience: "hotech-globe-tracker.apps-script.nonprod",
  signingKey: { keyId: "nonprod-k1", secret: "s".repeat(32) },
  testUserEmail: "agent@example.com",
  testUserSubject: "isolated-test-subject-1",
};
const clock = { now: () => new Date("2026-09-15T00:00:00.000Z") };

function jsonResponse(status: number, body: unknown) {
  return { status, text: async () => JSON.stringify(body) };
}

/**
 * A minimal, correctly-behaving fake of the Phase 03C1A ingress: it accepts
 * any well-formed, unexpired, non-replayed, correctly-addressed envelope and
 * otherwise returns a safe AUTH_DENIED/VALIDATION_ERROR envelope. It exists
 * only to drive the runner's own request construction and response
 * interpretation under test, not to re-verify the real ingress/domain logic
 * (which is covered by apps-script/test/phase-03c1a-ingress.test.ts and
 * apps-script/test/phase-03b.test.ts).
 */
function fakeAppsScript(): Fetcher {
  const seenJti = new Set<string>();
  let sessionActive = true;
  return async (_url, init) => {
    if (init.method !== "POST") return { status: 200, text: async () => "" };
    const contentType = init.headers["content-type"] ?? "";
    if (!/^application\/json(;\s*charset=utf-8)?$/i.test(contentType))
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "VALIDATION_ERROR", message: "bad content type" },
      });
    let outer: Record<string, unknown>;
    try {
      outer = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "VALIDATION_ERROR", message: "malformed" },
      });
    }
    if (
      Object.keys(outer).length !== 2 ||
      !("operation" in outer) ||
      !("envelope" in outer)
    )
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "VALIDATION_ERROR", message: "bad outer keys" },
      });
    const allowed = [
      "login_first_bind",
      "validate_session",
      "issue_csrf",
      "logout",
    ];
    if (!allowed.includes(outer.operation as string))
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "denied" },
      });
    const envelope = outer.envelope as Record<string, unknown>;
    if (Buffer.byteLength(init.body, "utf8") > 16 * 1024)
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "VALIDATION_ERROR", message: "too large" },
      });
    const expectedSignature = nodeCryptoAdapter.hmacSha256(
      config.signingKey.secret,
      signingInput({
        keyId: envelope.key_id as string,
        audience: envelope.audience as string,
        issuedAt: envelope.issued_at as string,
        expiresAt: envelope.expires_at as string,
        jti: envelope.jti as string,
        method: envelope.method as string,
        path: envelope.path as string,
        bodyDigest: envelope.body_digest as string,
      }),
    );
    if (envelope.signature !== expectedSignature)
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "bad signature" },
      });
    if (envelope.audience !== config.audience)
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "bad audience" },
      });
    if (
      outer.operation === "validate_session" &&
      envelope.path !== "/internal/v1/auth/session/validate"
    )
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "bad path" },
      });
    const expiresAt = Date.parse(envelope.expires_at as string);
    if (Number.isFinite(expiresAt) && expiresAt < clock.now().getTime())
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "expired" },
      });
    const jti = envelope.jti as string;
    if (seenJti.has(jti))
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "replay" },
      });
    seenJti.add(jti);
    if (outer.operation === "logout") sessionActive = false;
    if (outer.operation === "validate_session" && !sessionActive)
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "session revoked" },
      });
    return jsonResponse(200, {
      ok: true,
      requestId: "r1",
      data: { userId: "u1", role: "Agent", sessionId: "s1" },
      meta: { timestamp: "2026-09-15T00:00:00.000Z", nextCursor: null },
    });
  };
}

describe("Phase 03C1A live acceptance runner", () => {
  it("produces a sanitized summary shape with only suite/ok/passed/failed/checks", async () => {
    const summary = await runPhase03C1AAcceptance(
      config,
      fakeAppsScript(),
      clock,
    );
    expect(Object.keys(summary).sort()).toEqual([
      "checks",
      "failed",
      "ok",
      "passed",
      "suite",
    ]);
    expect(summary.suite).toBe("phase-03c1a-live-acceptance");
    for (const check of summary.checks) {
      expect(Object.keys(check).sort()).toEqual(["name", "ok", "safeCode"]);
      expect(typeof check.name).toBe("string");
      expect(typeof check.ok).toBe("boolean");
    }
  });

  it("passes all checks against a correctly behaving fake ingress", async () => {
    const summary = await runPhase03C1AAcceptance(
      config,
      fakeAppsScript(),
      clock,
    );
    const failing = summary.checks.filter((check) => !check.ok);
    expect(failing).toEqual([]);
    expect(summary.ok).toBe(true);
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(summary.checks.length);
  });

  it("maps AUTH_DENIED/VALIDATION_ERROR outcomes to the expected safe codes", async () => {
    const summary = await runPhase03C1AAcceptance(
      config,
      fakeAppsScript(),
      clock,
    );
    const byName = new Map(summary.checks.map((check) => [check.name, check]));
    expect(byName.get("invalid signature is denied")?.safeCode).toBe(
      "AUTH_DENIED",
    );
    expect(byName.get("wrong audience is denied")?.safeCode).toBe(
      "AUTH_DENIED",
    );
    expect(byName.get("wrong internal path/contract is denied")?.safeCode).toBe(
      "AUTH_DENIED",
    );
    expect(byName.get("expired assertion is denied")?.safeCode).toBe(
      "AUTH_DENIED",
    );
    expect(byName.get("replayed envelope is denied")?.safeCode).toBe(
      "AUTH_DENIED",
    );
    expect(
      byName.get(
        'disallowed operation "rotate_session" is denied before dispatch',
      )?.safeCode,
    ).toBe("AUTH_DENIED");
    expect(
      byName.get(
        'disallowed operation "revoke_session" is denied before dispatch',
      )?.safeCode,
    ).toBe("AUTH_DENIED");
    expect(byName.get("malformed JSON body is rejected")?.safeCode).toBe(
      "VALIDATION_ERROR",
    );
    expect(byName.get("missing envelope key is rejected")?.safeCode).toBe(
      "VALIDATION_ERROR",
    );
    expect(
      byName.get("oversized body (>16 KiB UTF-8) is rejected")?.safeCode,
    ).toBe("VALIDATION_ERROR");
    expect(byName.get("wrong Content-Type is rejected")?.safeCode).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("accepts application/json with a charset=utf-8 parameter as its own explicit case", async () => {
    const summary = await runPhase03C1AAcceptance(
      config,
      fakeAppsScript(),
      clock,
    );
    const check = summary.checks.find(
      (item) => item.name === "application/json; charset=utf-8 is accepted",
    );
    expect(check).toBeDefined();
    expect(check?.ok).toBe(true);
    expect(check?.safeCode === "OK" || check?.safeCode === "AUTH_DENIED").toBe(
      true,
    );
  });

  it("flags a response as failed and never as OK when it echoes a secret value", async () => {
    const leaking: Fetcher = async (_url, init) => {
      let outer: { envelope?: { payload?: unknown } } = {};
      try {
        outer = JSON.parse(init.body) as { envelope?: { payload?: unknown } };
      } catch {
        return jsonResponse(200, {
          ok: false,
          requestId: "r1",
          error: { code: "VALIDATION_ERROR", message: "malformed" },
        });
      }
      // Simulate a broken/compromised server that echoes back the raw
      // payload it received, including the session token.
      return jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { userId: "u1", role: "Agent", sessionId: "s1" },
        debugEcho: outer.envelope?.payload ?? null,
      });
    };
    const summary = await runPhase03C1AAcceptance(config, leaking, clock);
    const loginCheck = summary.checks.find(
      (check) => check.name === "valid login_first_bind succeeds",
    );
    expect(loginCheck?.ok).toBe(false);
    expect(loginCheck?.safeCode).toBe("UNEXPECTED");
  });

  it("flags a response as failed when it contains a raw error stack trace", async () => {
    const leakingStack: Fetcher = async () =>
      jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: {
          code: "INTERNAL_ERROR",
          message: "boom",
          stack: "Error: boom\n    at Object.<anonymous> (/app/index.js:1:1)",
        },
      });
    const summary = await runPhase03C1AAcceptance(config, leakingStack, clock);
    expect(summary.checks.every((check) => !check.ok)).toBe(true);
    expect(summary.ok).toBe(false);
  });

  it("flags a response as failed when it contains an email address", async () => {
    const leakingEmail: Fetcher = async () =>
      jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "denied for agent@example.com" },
      });
    const summary = await runPhase03C1AAcceptance(config, leakingEmail, clock);
    expect(summary.checks.every((check) => !check.ok)).toBe(true);
  });

  it("never includes the session token, CSRF token, or HMAC secret in the summary object itself", async () => {
    const summary = await runPhase03C1AAcceptance(
      config,
      fakeAppsScript(),
      clock,
    );
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(config.signingKey.secret);
    expect(serialized).not.toContain(config.testUserEmail);
    expect(serialized).not.toContain(config.testUserSubject);
  });
});
