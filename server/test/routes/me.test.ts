import { describe, expect, it } from "vitest";

import { handleMeRoute } from "../../auth/routes/me";
import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
  baseRouteDependencies,
  fakeAppsScriptClient,
  fakeOutageRateLimiter,
} from "../fakes/route-deps";

function request(
  cookieHeader: string | null = "__Host-hotech_session=session-token",
) {
  return {
    method: "GET",
    cookieHeader,
    headers: {},
    body: undefined,
    clientIp: "203.0.113.1",
  };
}

describe("GET /api/auth/me", () => {
  it("returns 401 when no session cookie is present", async () => {
    const response = await handleMeRoute(
      request(null),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("returns the user, session expiries, and redirectTo on a valid session", async () => {
    const response = await handleMeRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient({
          userId: "u1",
          role: "Processor",
          sessionId: "s1",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = response.body as {
      data: {
        user: { role: string };
        session: { idleExpiresAt: string; absoluteExpiresAt: string };
        redirectTo: string;
      };
    };
    expect(body.data.user.role).toBe("Processor");
    expect(body.data.redirectTo).toBe("/processor/dashboard");
    expect(typeof body.data.session.idleExpiresAt).toBe("string");
    expect(typeof body.data.session.absoluteExpiresAt).toBe("string");
  });

  it("returns 401 SESSION_EXPIRED and clears the session cookie when Apps Script denies", async () => {
    const response = await handleMeRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient(new AppsScriptDeniedError()),
      }),
    );
    expect(response.status).toBe(401);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "SESSION_EXPIRED",
    );
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_session=; ")),
    ).toBe(true);
  });

  it("stays available when the rate limiter itself is down (me is not fail-closed on RL)", async () => {
    const response = await handleMeRoute(
      request(),
      baseRouteDependencies({
        rateLimiter: fakeOutageRateLimiter(),
        appsScript: fakeAppsScriptClient({
          userId: "u1",
          role: "Admin",
          sessionId: "s1",
        }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 503 when Apps Script itself is unavailable", async () => {
    const response = await handleMeRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient(new AppsScriptUnavailableError()),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("sets Cache-Control: no-store", async () => {
    const response = await handleMeRoute(
      request(),
      baseRouteDependencies({
        appsScript: fakeAppsScriptClient({
          userId: "u1",
          role: "Admin",
          sessionId: "s1",
        }),
      }),
    );
    expect(response.headers["Cache-Control"]).toBe("no-store");
  });
});
