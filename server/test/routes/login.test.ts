import { describe, expect, it, vi } from "vitest";

import { handleLoginRoute } from "../../auth/routes/login";
import type { AppsScriptAuthClient } from "../../auth/apps-script-client";
import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
  baseRouteDependencies,
  fakeAdminLogin,
  fakeAppsScriptClient,
  fakeDenyingRateLimiter,
  fakeOutageRateLimiter,
} from "../fakes/route-deps";

const VALID_BODY = { username: "ryanzkey", password: "correct-password" };

function request(
  overrides: Partial<Parameters<typeof handleLoginRoute>[0]> = {},
) {
  return {
    method: "POST",
    cookieHeader: null,
    headers: {},
    body: VALID_BODY,
    clientIp: "203.0.113.1",
    ...overrides,
  };
}

const adminResult = { userId: "u1", role: "Admin", sessionId: "s1" };

function errorCode(response: { body: unknown }): string {
  return (response.body as { error: { code: string } }).error.code;
}

describe("POST /api/auth/login", () => {
  it("returns 404 for non-POST methods", async () => {
    const response = await handleLoginRoute(
      request({ method: "GET" }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(404);
  });

  it.each([
    [{}],
    [{ username: "ryanzkey" }],
    [{ password: "correct-password" }],
    [{ username: "", password: "correct-password" }],
    [{ username: "ryanzkey", password: 123 }],
    [{ username: "ryanzkey", password: "x".repeat(257) }],
    [null],
  ])("returns 400 for an invalid body %j", async (body) => {
    const response = await handleLoginRoute(
      request({ body }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 for a wrong password and never calls Apps Script", async () => {
    const execute = vi.fn();
    const response = await handleLoginRoute(
      request({ body: { username: "ryanzkey", password: "wrong" } }),
      baseRouteDependencies({ appsScript: { execute } }),
    );
    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe("AUTH_REQUIRED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns 401 for an unknown username", async () => {
    const response = await handleLoginRoute(
      request({ body: { username: "someone", password: "correct-password" } }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("signs in the Admin, binds the configured subject, and sets session/csrf cookies", async () => {
    const execute = vi.fn<AppsScriptAuthClient["execute"]>(
      async () => adminResult,
    );
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({ appsScript: { execute } }),
    );
    expect(response.status).toBe(200);
    const body = response.body as {
      ok: true;
      data: { user: { role: string }; redirectTo: string };
    };
    expect(body.data.user.role).toBe("Admin");
    expect(body.data.redirectTo).toBe("/admin/dashboard");
    expect(execute).toHaveBeenCalledWith(
      "login_first_bind",
      expect.objectContaining({
        email: "admin@example.com",
        sub: "password:ryanzkey",
        email_verified: true,
      }),
    );
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_session=")),
    ).toBe(true);
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_csrf=")),
    ).toBe(true);
  });

  it("returns 503 when ADMIN_EMAIL is not configured", async () => {
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({
        adminLogin: fakeAdminLogin({ email: null }),
        appsScript: fakeAppsScriptClient(adminResult),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("returns 429 when the per-IP login rate limit is exceeded", async () => {
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeDenyingRateLimiter() }),
    );
    expect(response.status).toBe(429);
  });

  it("applies the per-username rate limit before checking the password", async () => {
    const verify = vi.fn(async () => true);
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({
        adminLogin: fakeAdminLogin({ verify }),
        rateLimiter: {
          check: vi.fn(async (bucket) => ({
            allowed: bucket !== "login-user",
          })),
        },
      }),
    );
    expect(response.status).toBe(429);
    expect(verify).not.toHaveBeenCalled();
  });

  it("fails closed with 502 UPSTREAM_UNAVAILABLE when the rate limiter is down", async () => {
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeOutageRateLimiter() }),
    );
    expect(response.status).toBe(502);
    expect(errorCode(response)).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("returns 503 when Apps Script is unavailable", async () => {
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient(new AppsScriptUnavailableError()),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("returns 403 when Apps Script denies the login", async () => {
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient(new AppsScriptDeniedError()),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("never leaks the password, email, or subject in the response body", async () => {
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({ appsScript: fakeAppsScriptClient(adminResult) }),
    );
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain("correct-password");
    expect(raw).not.toContain("admin@example.com");
    expect(raw).not.toContain("password:ryanzkey");
  });

  it("rejects a request whose Origin header does not match the configured app origin", async () => {
    const response = await handleLoginRoute(
      request({ headers: { origin: "https://evil.example.com" } }),
      baseRouteDependencies({ appsScript: fakeAppsScriptClient(adminResult) }),
    );
    expect(response.status).toBe(403);
  });

  it("allows a request with no Origin header (same-site default)", async () => {
    const response = await handleLoginRoute(
      request(),
      baseRouteDependencies({ appsScript: fakeAppsScriptClient(adminResult) }),
    );
    expect(response.status).toBe(200);
  });
});
