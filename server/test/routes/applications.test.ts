import { describe, expect, it } from "vitest";

import {
  handleAssignApplicationRoute,
  handleCreateApplicationRoute,
  handleGetApplicationRoute,
  handleListApplicationsRoute,
  handleUpdateApplicationRoute,
} from "../../crud/routes/applications";
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
  } as Parameters<typeof handleListApplicationsRoute>[0];
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

describe("GET /api/applications", () => {
  it("returns 401 when no session cookie is present", async () => {
    const response = await handleListApplicationsRoute(
      request({ cookieHeader: null }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("returns the applications list and nextCursor on success", async () => {
    const response = await handleListApplicationsRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: [{ applicationId: "a1" }],
          nextCursor: "25",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = response.body as {
      data: { applications: unknown; nextCursor: string | null };
    };
    expect(body.data.applications).toEqual([{ applicationId: "a1" }]);
    expect(body.data.nextCursor).toBe("25");
  });

  it("stays available when the rate limiter itself is down", async () => {
    const response = await handleListApplicationsRoute(
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
    const response = await handleListApplicationsRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeDenyingRateLimiter() }),
    );
    expect(response.status).toBe(429);
  });

  it("returns 503 when Apps Script is unavailable", async () => {
    const response = await handleListApplicationsRoute(
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
    const response = await handleListApplicationsRoute(
      request({ method: "DELETE" }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/applications/:applicationId", () => {
  it("returns 400 when applicationId is missing", async () => {
    const response = await handleGetApplicationRoute(
      request(),
      baseRouteDependencies(),
      "",
    );
    expect(response.status).toBe(400);
  });

  it("returns the application on success", async () => {
    const response = await handleGetApplicationRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: { applicationId: "a1" },
          nextCursor: null,
        }),
      }),
      "a1",
    );
    expect(response.status).toBe(200);
  });

  it("returns 403 FORBIDDEN when Apps Script denies (wrong role or not your row)", async () => {
    const response = await handleGetApplicationRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("FORBIDDEN"),
        ),
      }),
      "a1",
    );
    expect(response.status).toBe(403);
  });

  it("returns 404 NOT_FOUND for a nonexistent application", async () => {
    const response = await handleGetApplicationRoute(
      request(),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("NOT_FOUND"),
        ),
      }),
      "missing",
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/applications", () => {
  it("returns 401 when no session cookie is present", async () => {
    const response = await handleCreateApplicationRoute(
      mutatingRequest({ cookieHeader: null }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when the CSRF header/cookie do not match", async () => {
    const response = await handleCreateApplicationRoute(
      mutatingRequest({ headers: { "x-csrf-token": "wrong" } }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(403);
  });

  it("returns 403 when the Origin header does not match the app origin", async () => {
    const response = await handleCreateApplicationRoute(
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

  it("returns 400 when required fields are missing", async () => {
    const response = await handleCreateApplicationRoute(
      mutatingRequest({ body: { customerFullName: "Juan" } }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(400);
  });

  it("creates an application and returns 200 on success", async () => {
    const response = await handleCreateApplicationRoute(
      mutatingRequest({
        body: {
          customerFullName: "Juan Dela Cruz",
          mobileNumber: "09171234567",
          completeAddress: "123 Rizal St",
          barangay: "Barangay 1",
          cityMunicipality: "Quezon City",
          province: "Metro Manila",
          planId: "plan-1",
        },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: { applicationId: "a1", currentStatus: "Pending" },
          nextCursor: null,
        }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 403 FORBIDDEN when Apps Script denies a Processor create", async () => {
    const response = await handleCreateApplicationRoute(
      mutatingRequest({
        body: {
          customerFullName: "Juan",
          mobileNumber: "09171234567",
          completeAddress: "123 Rizal St",
          barangay: "Barangay 1",
          cityMunicipality: "Quezon City",
          province: "Metro Manila",
          planId: "plan-1",
        },
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
    const response = await handleCreateApplicationRoute(
      mutatingRequest({ method: "GET" }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/applications/:applicationId", () => {
  it("returns 400 when version is missing", async () => {
    const response = await handleUpdateApplicationRoute(
      mutatingRequest({ method: "PATCH", body: { notes: "hi" } }),
      baseRouteDependencies(),
      "a1",
    );
    expect(response.status).toBe(400);
  });

  it("updates an application and returns 200 on success", async () => {
    const response = await handleUpdateApplicationRoute(
      mutatingRequest({
        method: "PATCH",
        body: { version: 1, currentStatus: "Transmitted" },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: { applicationId: "a1", currentStatus: "Transmitted" },
          nextCursor: null,
        }),
      }),
      "a1",
    );
    expect(response.status).toBe(200);
  });

  it("returns 409 REPLAY_OR_CONFLICT on a stale version", async () => {
    const response = await handleUpdateApplicationRoute(
      mutatingRequest({ method: "PATCH", body: { version: 1 } }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("CONFLICT"),
        ),
      }),
      "a1",
    );
    expect(response.status).toBe(409);
  });

  it("returns 403 FORBIDDEN for an Agent editing a non-Pending application", async () => {
    const response = await handleUpdateApplicationRoute(
      mutatingRequest({
        method: "PATCH",
        body: { version: 1, customerFullName: "New Name" },
      }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("FORBIDDEN"),
        ),
      }),
      "a1",
    );
    expect(response.status).toBe(403);
  });

  it("returns 404 for a non-PATCH method", async () => {
    const response = await handleUpdateApplicationRoute(
      mutatingRequest({ method: "GET" }),
      baseRouteDependencies(),
      "a1",
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/applications/:applicationId/assign", () => {
  it("returns 400 when processorId or version is missing", async () => {
    const response = await handleAssignApplicationRoute(
      mutatingRequest({ body: { version: 1 } }),
      baseRouteDependencies(),
      "a1",
    );
    expect(response.status).toBe(400);
  });

  it("assigns a Processor and returns 200 on success", async () => {
    const response = await handleAssignApplicationRoute(
      mutatingRequest({ body: { version: 1, processorId: "proc-1" } }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient({
          data: { applicationId: "a1", processorId: "proc-1" },
          nextCursor: null,
        }),
      }),
      "a1",
    );
    expect(response.status).toBe(200);
  });

  it("returns 403 FORBIDDEN when a non-Admin attempts to assign", async () => {
    const response = await handleAssignApplicationRoute(
      mutatingRequest({ body: { version: 1, processorId: "proc-1" } }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("FORBIDDEN"),
        ),
      }),
      "a1",
    );
    expect(response.status).toBe(403);
  });

  it("returns 400 VALIDATION_ERROR when the target user is not an Active Processor", async () => {
    const response = await handleAssignApplicationRoute(
      mutatingRequest({ body: { version: 1, processorId: "not-a-processor" } }),
      baseRouteDependencies({
        appsScriptCrud: fakeAppsScriptCrudClient(
          new CrudAppsScriptDeniedError("VALIDATION_ERROR"),
        ),
      }),
      "a1",
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for a non-POST method", async () => {
    const response = await handleAssignApplicationRoute(
      mutatingRequest({ method: "GET" }),
      baseRouteDependencies(),
      "a1",
    );
    expect(response.status).toBe(404);
  });
});
