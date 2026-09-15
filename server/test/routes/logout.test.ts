import { describe, expect, it } from "vitest";

import { handleLogoutRoute } from "../../auth/routes/logout";
import {
  AppsScriptUnavailableError,
  baseRouteDependencies,
  fakeAppsScriptClient,
  fakeDenyingRateLimiter,
} from "../fakes/route-deps";

const SESSION_COOKIE = "__Host-hotech_session=s1";
const CSRF_COOKIE = "__Host-hotech_csrf=csrf-value";

function request(
  overrides: Partial<Parameters<typeof handleLogoutRoute>[0]> = {},
) {
  return {
    method: "POST",
    cookieHeader: `${SESSION_COOKIE}; ${CSRF_COOKIE}`,
    headers: { "x-csrf-token": "csrf-value" },
    body: undefined,
    clientIp: "203.0.113.1",
    ...overrides,
  };
}

function clearsAllCookies(cookies: string[]): boolean {
  return (
    cookies.some((c) => c.startsWith("__Host-hotech_session=; ")) &&
    cookies.some((c) => c.startsWith("__Host-hotech_csrf=; ")) &&
    cookies.some((c) => c.startsWith("__Host-hotech_login=; "))
  );
}

describe("POST /api/auth/logout", () => {
  it("is idempotent when no session cookie is present: still returns success and clears cookies", async () => {
    const response = await handleLogoutRoute(
      request({ cookieHeader: null, headers: {} }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(200);
    expect(
      (response.body as { data: { loggedOut: boolean } }).data.loggedOut,
    ).toBe(true);
    expect(clearsAllCookies(response.cookies)).toBe(true);
  });

  it("requires matching CSRF cookie and header when a session is present", async () => {
    const response = await handleLogoutRoute(
      request({ headers: { "x-csrf-token": "wrong-value" } }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(403);
    expect(clearsAllCookies(response.cookies)).toBe(true);
  });

  it("succeeds and clears cookies when the session and CSRF are valid", async () => {
    const response = await handleLogoutRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient({ userId: "u1", role: "Agent" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(clearsAllCookies(response.cookies)).toBe(true);
  });

  it("still clears cookies and reports success even when Apps Script revocation fails", async () => {
    const response = await handleLogoutRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient(new AppsScriptUnavailableError()),
      }),
    );
    expect(response.status).toBe(200);
    expect(clearsAllCookies(response.cookies)).toBe(true);
  });

  it("still clears cookies when rate limiting denies logout, but reports RATE_LIMITED", async () => {
    const response = await handleLogoutRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeDenyingRateLimiter() }),
    );
    expect(response.status).toBe(429);
    expect(clearsAllCookies(response.cookies)).toBe(true);
  });

  it("rejects non-POST methods with 404 while still clearing cookies", async () => {
    const response = await handleLogoutRoute(
      request({ method: "GET" }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(404);
    expect(clearsAllCookies(response.cookies)).toBe(true);
  });

  it("sets Cache-Control: no-store", async () => {
    const response = await handleLogoutRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient({ userId: "u1", role: "Agent" }),
      }),
    );
    expect(response.headers["Cache-Control"]).toBe("no-store");
  });

  it("rejects a mismatched Origin header but still clears cookies (defense-in-depth)", async () => {
    const response = await handleLogoutRoute(
      request({
        headers: {
          "x-csrf-token": "csrf-value",
          origin: "https://evil.example.com",
        },
      }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(403);
    expect(clearsAllCookies(response.cookies)).toBe(true);
  });
});
