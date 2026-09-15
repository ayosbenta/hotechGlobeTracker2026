import { describe, expect, it } from "vitest";

import {
  handleCreatePlanRoute,
  handleListPlansRoute,
  handleUpdatePlanRoute,
} from "../../crud/routes/plans";
import {
  baseRouteDependencies,
  CrudAppsScriptDeniedError,
  CrudAppsScriptUnavailableError,
  fakeAppsScriptCrudClient,
  fakeDenyingRateLimiter,
  fakeOutageRateLimiter,
} from "../fakes/route-deps";

const SESSION_COOKIE = "__Host-hotech_session=session-token";
const CSRF_COOKIE = "__Host-hotech_csrf=csrf-token";

function request(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    method: "GET",
    cookieHeader: SESSION_COOKIE,
    headers: {},
    body: undefined,
    clientIp: "203.0.113.1",
    ...overrides,
  } as Parameters<typeof handleListPlansRoute>[0];
}

function mutatingRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return request({
    method: "POST",
    cookieHeader: `${SESSION_COOKIE}; ${CSRF_COOKIE}`,
    headers: {
      "x-csrf-token": "csrf-token",
      origin: "https://app.example.com",
    },
    ...overrides,
  });
}

describe("GET /api/plans", () => {
  it("returns 401 when no session cookie is present", async () => {
    const response = await handleListPlansRoute(
      request({ cookieHeader: null }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("returns the plans list and nextCursor on success", async () => {
    const response = await handleListPlansRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: [{ planId: "p1" }],
          nextCursor: "25",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = response.body as {
      data: { plans: unknown; nextCursor: string | null };
    };
    expect(body.data.plans).toEqual([{ planId: "p1" }]);
    expect(body.data.nextCursor).toBe("25");
  });

  it("stays available when the rate limiter itself is down", async () => {
    const response = await handleListPlansRoute(
      request(),
      baseRouteDependencies({
        rateLimiter: fakeOutageRateLimiter(),
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: [],
          nextCursor: null,
        }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 429 when the rate limiter denies", async () => {
    const response = await handleListPlansRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeDenyingRateLimiter() }),
    );
    expect(response.status).toBe(429);
  });

  it("returns 401 SESSION_EXPIRED and clears the session cookie when Apps Script denies with AUTH_DENIED", async () => {
    const response = await handleListPlansRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("AUTH_DENIED"),
        ),
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

  it("returns 503 when Apps Script is unavailable", async () => {
    const response = await handleListPlansRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptUnavailableError(),
        ),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("returns 404 for a non-GET method", async () => {
    const response = await handleListPlansRoute(
      request({ method: "DELETE" }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/plans", () => {
  it("returns 401 when no session cookie is present", async () => {
    const response = await handleCreatePlanRoute(
      mutatingRequest({ cookieHeader: null }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when the CSRF header/cookie do not match", async () => {
    const response = await handleCreatePlanRoute(
      mutatingRequest({ headers: { "x-csrf-token": "wrong" } }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(403);
  });

  it("returns 403 when the Origin header does not match the app origin", async () => {
    const response = await handleCreatePlanRoute(
      mutatingRequest({
        headers: {
          "x-csrf-token": "csrf-token",
          origin: "https://evil.example.com",
        },
      }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(403);
  });

  it("returns 400 when required plan fields are missing or the wrong type", async () => {
    const response = await handleCreatePlanRoute(
      mutatingRequest({ body: { planName: "Fiber 100" } }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(400);
  });

  it("creates a plan and returns 200 on success", async () => {
    const response = await handleCreatePlanRoute(
      mutatingRequest({
        body: { planName: "Fiber 100", monthlyPrice: 1299, speedMbps: 100 },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: { planId: "p1", planName: "Fiber 100" },
          nextCursor: null,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect((response.body as { data: { plan: unknown } }).data.plan).toEqual({
      planId: "p1",
      planName: "Fiber 100",
    });
  });

  it("returns 403 FORBIDDEN when Apps Script denies a non-Admin actor", async () => {
    const response = await handleCreatePlanRoute(
      mutatingRequest({
        body: { planName: "Fiber 100", monthlyPrice: 1299, speedMbps: 100 },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("FORBIDDEN"),
        ),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("returns 404 for a non-POST method", async () => {
    const response = await handleCreatePlanRoute(
      mutatingRequest({ method: "GET" }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/plans/:planId", () => {
  it("returns 400 when planId is missing", async () => {
    const response = await handleUpdatePlanRoute(
      mutatingRequest({
        method: "PATCH",
        body: { expectedUpdatedAt: "2026-09-14T00:00:00.000Z" },
      }),
      baseRouteDependencies(),
      "",
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when expectedUpdatedAt is missing", async () => {
    const response = await handleUpdatePlanRoute(
      mutatingRequest({ method: "PATCH", body: { monthlyPrice: 1399 } }),
      baseRouteDependencies(),
      "plan-1",
    );
    expect(response.status).toBe(400);
  });

  it("updates a plan and returns 200 on success", async () => {
    const response = await handleUpdatePlanRoute(
      mutatingRequest({
        method: "PATCH",
        body: {
          expectedUpdatedAt: "2026-09-14T00:00:00.000Z",
          monthlyPrice: 1399,
        },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: { planId: "plan-1", monthlyPrice: 1399 },
          nextCursor: null,
        }),
      }),
      "plan-1",
    );
    expect(response.status).toBe(200);
  });

  it("returns 409 REPLAY_OR_CONFLICT on a stale version", async () => {
    const response = await handleUpdatePlanRoute(
      mutatingRequest({
        method: "PATCH",
        body: {
          expectedUpdatedAt: "2026-09-13T00:00:00.000Z",
          monthlyPrice: 1399,
        },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("CONFLICT"),
        ),
      }),
      "plan-1",
    );
    expect(response.status).toBe(409);
  });

  it("returns 404 NOT_FOUND for a nonexistent plan", async () => {
    const response = await handleUpdatePlanRoute(
      mutatingRequest({
        method: "PATCH",
        body: { expectedUpdatedAt: "2026-09-14T00:00:00.000Z" },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("NOT_FOUND"),
        ),
      }),
      "missing",
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for a non-PATCH method", async () => {
    const response = await handleUpdatePlanRoute(
      mutatingRequest({ method: "GET" }),
      baseRouteDependencies(),
      "plan-1",
    );
    expect(response.status).toBe(404);
  });
});
