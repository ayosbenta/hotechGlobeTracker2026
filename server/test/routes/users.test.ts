import { describe, expect, it } from "vitest";

import {
  handleListUsersRoute,
  handleUpdateUserRoute,
} from "../../crud/routes/users";
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
  } as Parameters<typeof handleListUsersRoute>[0];
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

describe("GET /api/users", () => {
  it("returns 401 when no session cookie is present", async () => {
    const response = await handleListUsersRoute(
      request({ cookieHeader: null }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("returns the users list and nextCursor on success", async () => {
    const response = await handleListUsersRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: [{ userId: "u1" }],
          nextCursor: "25",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = response.body as {
      data: { users: unknown; nextCursor: string | null };
    };
    expect(body.data.users).toEqual([{ userId: "u1" }]);
    expect(body.data.nextCursor).toBe("25");
  });

  it("stays available when the rate limiter itself is down", async () => {
    const response = await handleListUsersRoute(
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
    const response = await handleListUsersRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeDenyingRateLimiter() }),
    );
    expect(response.status).toBe(429);
  });

  it("returns 403 FORBIDDEN when Apps Script denies a non-Admin actor", async () => {
    const response = await handleListUsersRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("FORBIDDEN"),
        ),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("returns 401 SESSION_EXPIRED and clears the session cookie when Apps Script denies with AUTH_DENIED", async () => {
    const response = await handleListUsersRoute(
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
    const response = await handleListUsersRoute(
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
    const response = await handleListUsersRoute(
      request({ method: "DELETE" }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/users/:userId", () => {
  it("returns 401 when no session cookie is present", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({
        method: "PATCH",
        cookieHeader: null,
        body: { expectedUpdatedAt: "2026-09-14T00:00:00.000Z" },
      }),
      baseRouteDependencies(),
      "user-1",
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when the CSRF header/cookie do not match", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({
        method: "PATCH",
        headers: { "x-csrf-token": "wrong", origin: "https://app.example.com" },
        body: { expectedUpdatedAt: "2026-09-14T00:00:00.000Z" },
      }),
      baseRouteDependencies(),
      "user-1",
    );
    expect(response.status).toBe(403);
  });

  it("returns 403 when the Origin header does not match the app origin", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({
        method: "PATCH",
        headers: {
          "x-csrf-token": "csrf-token",
          origin: "https://evil.example.com",
        },
        body: { expectedUpdatedAt: "2026-09-14T00:00:00.000Z" },
      }),
      baseRouteDependencies(),
      "user-1",
    );
    expect(response.status).toBe(403);
  });

  it("returns 400 when userId is missing", async () => {
    const response = await handleUpdateUserRoute(
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
    const response = await handleUpdateUserRoute(
      mutatingRequest({ method: "PATCH", body: { fullName: "New Name" } }),
      baseRouteDependencies(),
      "user-1",
    );
    expect(response.status).toBe(400);
  });

  it("updates a user's profile and returns 200 on success", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({
        method: "PATCH",
        body: {
          expectedUpdatedAt: "2026-09-14T00:00:00.000Z",
          fullName: "New Name",
          mobileNumber: "09170001111",
        },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: { userId: "user-1", fullName: "New Name" },
          nextCursor: null,
        }),
      }),
      "user-1",
    );
    expect(response.status).toBe(200);
    expect((response.body as { data: { user: unknown } }).data.user).toEqual({
      userId: "user-1",
      fullName: "New Name",
    });
  });

  it("updates a user's role/account_status (Admin path) and returns 200 on success", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({
        method: "PATCH",
        body: {
          expectedUpdatedAt: "2026-09-14T00:00:00.000Z",
          role: "Processor",
          accountStatus: "Active",
        },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: { userId: "user-1", role: "Processor" },
          nextCursor: null,
        }),
      }),
      "user-1",
    );
    expect(response.status).toBe(200);
  });

  it("returns 403 FORBIDDEN when Apps Script denies (self-escalation/last-admin/non-admin cases)", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({
        method: "PATCH",
        body: {
          expectedUpdatedAt: "2026-09-14T00:00:00.000Z",
          role: "Agent",
        },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("FORBIDDEN"),
        ),
      }),
      "user-1",
    );
    expect(response.status).toBe(403);
  });

  it("returns 409 REPLAY_OR_CONFLICT on a stale version", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({
        method: "PATCH",
        body: {
          expectedUpdatedAt: "2026-09-13T00:00:00.000Z",
          fullName: "New Name",
        },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("CONFLICT"),
        ),
      }),
      "user-1",
    );
    expect(response.status).toBe(409);
  });

  it("returns 404 NOT_FOUND for a nonexistent user", async () => {
    const response = await handleUpdateUserRoute(
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

  it("returns 400 when a field has the wrong type", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({
        method: "PATCH",
        body: {
          expectedUpdatedAt: "2026-09-14T00:00:00.000Z",
          mobileNumber: 12345,
        },
      }),
      baseRouteDependencies(),
      "user-1",
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for a non-PATCH method", async () => {
    const response = await handleUpdateUserRoute(
      mutatingRequest({ method: "GET" }),
      baseRouteDependencies(),
      "user-1",
    );
    expect(response.status).toBe(404);
  });
});
