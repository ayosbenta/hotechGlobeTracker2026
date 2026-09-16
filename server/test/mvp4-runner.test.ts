import { describe, expect, it } from "vitest";

import type { Mvp4AcceptanceConfig } from "../acceptance/mvp4-env";
import type { Fetcher } from "../acceptance/mvp4-runner";
import { runMvp4Acceptance } from "../acceptance/mvp4-runner";
import { nodeCryptoAdapter } from "../auth/crypto";
import { signingInput } from "../auth/signing";

const config: Mvp4AcceptanceConfig = {
  authUrl:
    "https://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/auth",
  crudUrl:
    "https://script.google.com/macros/s/isolated-nonprod-abc/exec/v1/internal/crud",
  audience: "hotech-globe-tracker.apps-script.nonprod",
  signingKey: { keyId: "nonprod-k1", secret: "s".repeat(32) },
  testAdminEmail: "admin@example.com",
  testAdminSubject: "isolated-test-admin-subject-1",
};
const clock = { now: () => new Date("2026-09-16T00:00:00.000Z") };

function jsonResponse(status: number, body: unknown) {
  return { status, text: async () => JSON.stringify(body) };
}

/**
 * A minimal, correctly-behaving fake of BOTH the Phase 03C1A auth ingress
 * and the MVP-2 CRUD ingress (routed by URL), sufficient to drive the
 * MVP-4 runner's own request construction and response interpretation under
 * test — not a re-verification of the real ingress/domain logic, which is
 * covered by apps-script/test/*.test.ts.
 */
function fakeAppsScript(): Fetcher {
  const seenJti = new Set<string>();
  const sessionActive = true;
  let planCounter = 0;
  const plans = new Map<string, { updatedAt: string }>();

  function verify(
    envelope: Record<string, unknown>,
    expectedAudience: string,
  ): "AUTH_DENIED" | null {
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
    if (envelope.signature !== expectedSignature) return "AUTH_DENIED";
    if (envelope.audience !== expectedAudience) return "AUTH_DENIED";
    const jti = envelope.jti as string;
    if (seenJti.has(jti)) return "AUTH_DENIED";
    seenJti.add(jti);
    return null;
  }

  return async (url, init) => {
    if (init.method !== "POST") return { status: 200, text: async () => "" };
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
    const envelope = outer.envelope as Record<string, unknown>;
    const denial = verify(envelope, config.audience);
    if (denial !== null)
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: denial, message: "denied" },
      });

    const payload = envelope.payload as Record<string, unknown>;

    if (url === config.authUrl) {
      if (outer.operation === "login_first_bind") {
        return jsonResponse(200, {
          ok: true,
          requestId: "r1",
          data: { userId: "u1", role: "Admin", sessionId: "s1" },
          meta: { timestamp: "2026-09-16T00:00:00.000Z", nextCursor: null },
        });
      }
      if (outer.operation === "validate_session") {
        return sessionActive
          ? jsonResponse(200, {
              ok: true,
              requestId: "r1",
              data: { userId: "u1", role: "Admin", sessionId: "s1" },
              meta: { timestamp: "2026-09-16T00:00:00.000Z", nextCursor: null },
            })
          : jsonResponse(200, {
              ok: false,
              requestId: "r1",
              error: { code: "AUTH_DENIED", message: "revoked" },
            });
      }
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "unsupported" },
      });
    }

    // CRUD ingress.
    if (outer.operation === "plans_list") {
      return jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: Array.from(plans.keys()).map((planId) => ({ planId })),
        meta: { timestamp: "2026-09-16T00:00:00.000Z", nextCursor: null },
      });
    }
    if (outer.operation === "plans_create") {
      if (payload.csrf_token === undefined)
        return jsonResponse(200, {
          ok: false,
          requestId: "r1",
          error: { code: "AUTH_DENIED", message: "missing csrf" },
        });
      planCounter += 1;
      const planId = `plan-${planCounter}`;
      plans.set(planId, { updatedAt: "2026-09-16T00:00:00.000Z" });
      return jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { planId, updatedAt: "2026-09-16T00:00:00.000Z" },
        meta: { timestamp: "2026-09-16T00:00:00.000Z", nextCursor: null },
      });
    }
    if (outer.operation === "plans_update") {
      const planId = payload.plan_id as string;
      const existing = plans.get(planId);
      if (existing === undefined)
        return jsonResponse(200, {
          ok: false,
          requestId: "r1",
          error: { code: "NOT_FOUND", message: "not found" },
        });
      if (payload.expected_updated_at !== existing.updatedAt)
        return jsonResponse(200, {
          ok: false,
          requestId: "r1",
          error: { code: "CONFLICT", message: "stale" },
        });
      return jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { planId, updatedAt: "2026-09-16T00:01:00.000Z" },
        meta: { timestamp: "2026-09-16T00:00:00.000Z", nextCursor: null },
      });
    }
    if (outer.operation === "applications_create") {
      if (payload.csrf_token === undefined)
        return jsonResponse(200, {
          ok: false,
          requestId: "r1",
          error: { code: "AUTH_DENIED", message: "missing csrf" },
        });
      return jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { applicationId: "app-1", version: 1 },
        meta: { timestamp: "2026-09-16T00:00:00.000Z", nextCursor: null },
      });
    }
    if (outer.operation === "users_update") {
      return jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "NOT_FOUND", message: "not found" },
      });
    }
    if (outer.operation === "applications_aggregate") {
      return jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: {
          rangeStartDate: "2026-09-03",
          rangeEndDate: "2026-09-16",
          buckets: [],
        },
        meta: { timestamp: "2026-09-16T00:00:00.000Z", nextCursor: null },
      });
    }
    return jsonResponse(200, {
      ok: false,
      requestId: "r1",
      error: { code: "AUTH_DENIED", message: "unsupported operation" },
    });
  };
}

describe("MVP-4 live acceptance runner", () => {
  it("produces a sanitized summary shape with only suite/ok/passed/failed/checks", async () => {
    const summary = await runMvp4Acceptance(config, fakeAppsScript(), clock);
    expect(Object.keys(summary).sort()).toEqual([
      "checks",
      "failed",
      "ok",
      "passed",
      "suite",
    ]);
    expect(summary.suite).toBe("mvp4-live-acceptance");
    for (const check of summary.checks) {
      expect(Object.keys(check).sort()).toEqual(["name", "ok", "safeCode"]);
      expect(typeof check.name).toBe("string");
      expect(typeof check.ok).toBe("boolean");
    }
  });

  it("passes all checks against a correctly behaving fake ingress pair", async () => {
    const summary = await runMvp4Acceptance(config, fakeAppsScript(), clock);
    const failing = summary.checks.filter((check) => !check.ok);
    expect(failing).toEqual([]);
    expect(summary.ok).toBe(true);
  });

  it("covers session lifecycle, CRUD RBAC, CSRF, conflict, and dashboard-data checks", async () => {
    const summary = await runMvp4Acceptance(config, fakeAppsScript(), clock);
    const names = summary.checks.map((check) => check.name);
    expect(names.some((name) => name.includes("session lifecycle"))).toBe(true);
    expect(names.some((name) => name.includes("CRUD RBAC"))).toBe(true);
    expect(names.some((name) => name.includes("CRUD CSRF"))).toBe(true);
    expect(names.some((name) => name.includes("CRUD concurrency"))).toBe(true);
    expect(names.some((name) => name.includes("dashboard-data"))).toBe(true);
  });

  it("flags a missing-CSRF mutation as AUTH_DENIED", async () => {
    const summary = await runMvp4Acceptance(config, fakeAppsScript(), clock);
    const check = summary.checks.find((item) =>
      item.name.includes("without csrf_token"),
    );
    expect(check?.ok).toBe(true);
    expect(check?.safeCode).toBe("AUTH_DENIED");
  });

  it("flags a stale expected_updated_at as CONFLICT", async () => {
    const summary = await runMvp4Acceptance(config, fakeAppsScript(), clock);
    const check = summary.checks.find((item) =>
      item.name.includes("stale expected_updated_at"),
    );
    expect(check?.ok).toBe(true);
    expect(check?.safeCode).toBe("CONFLICT");
  });

  it("flags an invalid CRUD signature as AUTH_DENIED", async () => {
    const summary = await runMvp4Acceptance(config, fakeAppsScript(), clock);
    const check = summary.checks.find((item) =>
      item.name.includes("invalid signature is denied"),
    );
    expect(check?.ok).toBe(true);
    expect(check?.safeCode).toBe("AUTH_DENIED");
  });

  it("flags a response as failed when it echoes a secret value", async () => {
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
      return jsonResponse(200, {
        ok: true,
        requestId: "r1",
        data: { userId: "u1", role: "Admin", sessionId: "s1" },
        debugEcho: outer.envelope?.payload ?? null,
      });
    };
    const summary = await runMvp4Acceptance(config, leaking, clock);
    const loginCheck = summary.checks.find((check) =>
      check.name.includes("login_first_bind establishes a session"),
    );
    expect(loginCheck?.ok).toBe(false);
    expect(loginCheck?.safeCode).toBe("UNEXPECTED");
  });

  it("flags a response as failed when it contains a raw stack trace", async () => {
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
    const summary = await runMvp4Acceptance(config, leakingStack, clock);
    expect(summary.checks.every((check) => !check.ok)).toBe(true);
    expect(summary.ok).toBe(false);
  });

  it("flags a response as failed when it contains an email address", async () => {
    const leakingEmail: Fetcher = async () =>
      jsonResponse(200, {
        ok: false,
        requestId: "r1",
        error: { code: "AUTH_DENIED", message: "denied for admin@example.com" },
      });
    const summary = await runMvp4Acceptance(config, leakingEmail, clock);
    expect(summary.checks.every((check) => !check.ok)).toBe(true);
  });

  it("never includes the session token, CSRF token, or HMAC secret in the summary object itself", async () => {
    const summary = await runMvp4Acceptance(config, fakeAppsScript(), clock);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(config.signingKey.secret);
    expect(serialized).not.toContain(config.testAdminEmail);
    expect(serialized).not.toContain(config.testAdminSubject);
  });
});
