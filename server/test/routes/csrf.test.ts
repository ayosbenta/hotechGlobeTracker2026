import { describe, expect, it } from "vitest";

import { handleCsrfRoute } from "../../auth/routes/csrf";
import {
  AppsScriptDeniedError,
  baseRouteDependencies,
  fakeAppsScriptClient,
  fakeOutageRateLimiter,
} from "../fakes/route-deps";

function request(cookieHeader: string | null) {
  return {
    method: "GET",
    cookieHeader,
    headers: {},
    body: undefined,
    clientIp: "203.0.113.1",
  };
}

describe("GET /api/auth/csrf", () => {
  it("returns 401 without a session cookie", async () => {
    const response = await handleCsrfRoute(
      request(null),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("returns 401 without an existing csrf cookie to rotate", async () => {
    const response = await handleCsrfRoute(
      request("__Host-hotech_session=s1"),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("issues a new csrf token and sets the csrf cookie on success", async () => {
    const response = await handleCsrfRoute(
      request("__Host-hotech_session=s1; __Host-hotech_csrf=old-csrf"),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient({
          userId: "u1",
          role: "Agent",
          sessionId: "s1",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = response.body as { data: { csrfToken: string } };
    expect(typeof body.data.csrfToken).toBe("string");
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_csrf=")),
    ).toBe(true);
  });

  it("returns 401 SESSION_EXPIRED and clears session when Apps Script denies", async () => {
    const response = await handleCsrfRoute(
      request("__Host-hotech_session=s1; __Host-hotech_csrf=old-csrf"),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient(new AppsScriptDeniedError()),
      }),
    );
    expect(response.status).toBe(401);
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_session=; ")),
    ).toBe(true);
  });

  it("sets Cache-Control: no-store", async () => {
    const response = await handleCsrfRoute(
      request("__Host-hotech_session=s1; __Host-hotech_csrf=old-csrf"),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient({
          userId: "u1",
          role: "Agent",
          sessionId: "s1",
        }),
      }),
    );
    expect(response.headers["Cache-Control"]).toBe("no-store");
  });

  it("fails closed with 502 UPSTREAM_UNAVAILABLE when the rate limiter is down", async () => {
    const response = await handleCsrfRoute(
      request("__Host-hotech_session=s1; __Host-hotech_csrf=old-csrf"),
      baseRouteDependencies({ rateLimiter: fakeOutageRateLimiter() }),
    );
    expect(response.status).toBe(502);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });
});
