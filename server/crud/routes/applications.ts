import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
} from "../apps-script-crud-client";
import {
  clearSessionCookie,
  CSRF_HEADER_NAME,
  parseCookies,
  SESSION_COOKIE_NAME,
} from "../../auth/cookies";
import { verifyCsrfDoubleSubmit } from "../../auth/csrf";
import { BffError } from "../../auth/http-envelope";
import { originIsAllowed } from "../../auth/origin-check";
import {
  privacyKeyFor,
  RateLimitUnavailableError,
} from "../../auth/rate-limit";
import { jsonFailure, jsonSuccess } from "../../auth/respond";
import type {
  RouteDependencies,
  RouteRequest,
  RouteResponse,
} from "../../auth/route-types";

function requireSessionToken(request: RouteRequest): string {
  const cookies = parseCookies(request.cookieHeader);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) throw new BffError("AUTH_REQUIRED");
  return sessionToken;
}

function requireCsrfToken(request: RouteRequest): string {
  const csrfToken = verifyCsrfDoubleSubmit({
    cookieHeader: request.cookieHeader,
    headerValue: request.headers[CSRF_HEADER_NAME],
  });
  if (csrfToken === null) throw new BffError("FORBIDDEN");
  return csrfToken;
}

/** Same safe-error mapping shape as the other CRUD routes — no new codes. */
function mapCrudError(error: unknown): unknown {
  if (error instanceof BffError) return error;
  if (error instanceof RateLimitUnavailableError)
    return new BffError("UPSTREAM_UNAVAILABLE");
  if (error instanceof AppsScriptUnavailableError)
    return new BffError("AUTH_SERVICE_UNAVAILABLE");
  if (error instanceof AppsScriptDeniedError) {
    switch (error.scriptCode) {
      case "AUTH_DENIED":
        return new BffError("SESSION_EXPIRED");
      case "VALIDATION_ERROR":
        return new BffError("VALIDATION_ERROR");
      case "FORBIDDEN":
        return new BffError("FORBIDDEN");
      case "NOT_FOUND":
        return new BffError("NOT_FOUND");
      case "CONFLICT":
        return new BffError("REPLAY_OR_CONFLICT");
      default:
        return new BffError("INTERNAL_ERROR");
    }
  }
  return new BffError("INTERNAL_ERROR");
}

function maybeClearSession(error: unknown): string[] {
  if (error instanceof BffError && error.code === "SESSION_EXPIRED")
    return [clearSessionCookie()];
  if (
    error instanceof AppsScriptDeniedError &&
    error.scriptCode === "AUTH_DENIED"
  )
    return [clearSessionCookie()];
  return [];
}

interface ApplicationRequestBody {
  customerFullName?: unknown;
  mobileNumber?: unknown;
  email?: unknown;
  completeAddress?: unknown;
  barangay?: unknown;
  cityMunicipality?: unknown;
  province?: unknown;
  landmark?: unknown;
  planId?: unknown;
  agentId?: unknown;
  notes?: unknown;
  version?: unknown;
  currentStatus?: unknown;
  jobOrderNumber?: unknown;
  installedAt?: unknown;
  delayedFromStatus?: unknown;
  processorId?: unknown;
}

function parseBody(body: unknown): ApplicationRequestBody {
  if (body === null || typeof body !== "object") return {};
  return body as ApplicationRequestBody;
}

/** GET /api/applications — Admin, Agent, Processor (role-scoped by Apps Script). */
export async function handleListApplicationsRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "GET") throw new BffError("NOT_FOUND");
    const sessionToken = requireSessionToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    try {
      const limit = await deps.rateLimiter.check("applications-read", rateKey);
      if (!limit.allowed) throw new BffError("RATE_LIMITED");
    } catch (error) {
      if (error instanceof BffError) throw error;
      // A rate-limiter outage never blocks a read.
    }

    const query =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Record<string, unknown>)
        : {};

    const payload: Record<string, unknown> = { session_token: sessionToken };
    if (typeof query.cursor === "string") payload.cursor = query.cursor;
    if (typeof query.currentStatus === "string")
      payload.current_status = query.currentStatus;
    // agent_id/processor_id filters are pre-filtering hints only for Admin;
    // Apps Script never trusts these as authorization for a non-Admin actor.
    if (typeof query.agentId === "string") payload.agent_id = query.agentId;
    if (typeof query.processorId === "string")
      payload.processor_id = query.processorId;

    const result = await deps.appsScriptCrud.execute(
      "applications_list",
      payload,
    );

    return jsonSuccess(requestId, {
      applications: result.data,
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}

/** GET /api/applications/:applicationId — Admin any; Agent own; Processor assigned. */
export async function handleGetApplicationRoute(
  request: RouteRequest,
  deps: RouteDependencies,
  applicationId: string,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "GET") throw new BffError("NOT_FOUND");
    if (!applicationId) throw new BffError("VALIDATION_ERROR");
    const sessionToken = requireSessionToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    try {
      const limit = await deps.rateLimiter.check("applications-read", rateKey);
      if (!limit.allowed) throw new BffError("RATE_LIMITED");
    } catch (error) {
      if (error instanceof BffError) throw error;
    }

    const result = await deps.appsScriptCrud.execute("applications_get", {
      session_token: sessionToken,
      application_id: applicationId,
    });

    return jsonSuccess(requestId, { application: result.data });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}

/**
 * GET /api/applications/aggregate — Admin, Agent, Processor. Role scope
 * (global for Admin, own-only for Agent, assigned-only for Processor) is
 * enforced entirely in Apps Script from the session-derived actor; this
 * route only forwards the session token, never a client-supplied identity
 * or date range.
 */
export async function handleGetApplicationsAggregateRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "GET") throw new BffError("NOT_FOUND");
    const sessionToken = requireSessionToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    try {
      const limit = await deps.rateLimiter.check("applications-read", rateKey);
      if (!limit.allowed) throw new BffError("RATE_LIMITED");
    } catch (error) {
      if (error instanceof BffError) throw error;
      // A rate-limiter outage never blocks a read.
    }

    const result = await deps.appsScriptCrud.execute("applications_aggregate", {
      session_token: sessionToken,
    });

    return jsonSuccess(requestId, { aggregate: result.data });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}

/** POST /api/applications — Admin, Agent. */
export async function handleCreateApplicationRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "POST") throw new BffError("NOT_FOUND");
    if (!originIsAllowed(request.headers.origin, deps.appOrigin))
      throw new BffError("FORBIDDEN");

    const sessionToken = requireSessionToken(request);
    const csrfToken = requireCsrfToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    const limit = await deps.rateLimiter.check("applications-write", rateKey);
    if (!limit.allowed) throw new BffError("RATE_LIMITED");

    const body = parseBody(request.body);
    if (
      typeof body.customerFullName !== "string" ||
      typeof body.mobileNumber !== "string" ||
      typeof body.completeAddress !== "string" ||
      typeof body.barangay !== "string" ||
      typeof body.cityMunicipality !== "string" ||
      typeof body.province !== "string" ||
      typeof body.planId !== "string"
    )
      throw new BffError("VALIDATION_ERROR");

    const payload: Record<string, unknown> = {
      session_token: sessionToken,
      csrf_token: csrfToken,
      customer_full_name: body.customerFullName,
      mobile_number: body.mobileNumber,
      complete_address: body.completeAddress,
      barangay: body.barangay,
      city_municipality: body.cityMunicipality,
      province: body.province,
      plan_id: body.planId,
    };
    if (typeof body.email === "string") payload.email = body.email;
    if (typeof body.landmark === "string") payload.landmark = body.landmark;
    if (typeof body.notes === "string") payload.notes = body.notes;
    // agent_id is only meaningful for an Admin-created application; Apps
    // Script always derives an Agent's own agent_id from the session.
    if (typeof body.agentId === "string") payload.agent_id = body.agentId;

    const result = await deps.appsScriptCrud.execute(
      "applications_create",
      payload,
    );

    return jsonSuccess(requestId, { application: result.data });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}

/** PATCH /api/applications/:applicationId — Admin any; Agent own+Pending; Processor assigned. */
export async function handleUpdateApplicationRoute(
  request: RouteRequest,
  deps: RouteDependencies,
  applicationId: string,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "PATCH") throw new BffError("NOT_FOUND");
    if (!originIsAllowed(request.headers.origin, deps.appOrigin))
      throw new BffError("FORBIDDEN");
    if (!applicationId) throw new BffError("VALIDATION_ERROR");

    const sessionToken = requireSessionToken(request);
    const csrfToken = requireCsrfToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    const limit = await deps.rateLimiter.check("applications-write", rateKey);
    if (!limit.allowed) throw new BffError("RATE_LIMITED");

    const body = parseBody(request.body);
    if (typeof body.version !== "number")
      throw new BffError("VALIDATION_ERROR");

    const payload: Record<string, unknown> = {
      session_token: sessionToken,
      csrf_token: csrfToken,
      application_id: applicationId,
      version: body.version,
    };
    const stringFields: [keyof ApplicationRequestBody, string][] = [
      ["customerFullName", "customer_full_name"],
      ["mobileNumber", "mobile_number"],
      ["email", "email"],
      ["completeAddress", "complete_address"],
      ["barangay", "barangay"],
      ["cityMunicipality", "city_municipality"],
      ["province", "province"],
      ["landmark", "landmark"],
      ["planId", "plan_id"],
      ["notes", "notes"],
      ["currentStatus", "current_status"],
      ["jobOrderNumber", "job_order_number"],
      ["installedAt", "installed_at"],
      ["delayedFromStatus", "delayed_from_status"],
    ];
    for (const [bodyKey, payloadKey] of stringFields) {
      const value = body[bodyKey];
      if (value !== undefined) {
        if (typeof value !== "string") throw new BffError("VALIDATION_ERROR");
        payload[payloadKey] = value;
      }
    }
    if (body.agentId !== undefined) {
      if (typeof body.agentId !== "string")
        throw new BffError("VALIDATION_ERROR");
      payload.agent_id = body.agentId;
    }

    const result = await deps.appsScriptCrud.execute(
      "applications_update",
      payload,
    );

    return jsonSuccess(requestId, { application: result.data });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}

/** POST /api/applications/:applicationId/assign — Admin only. */
export async function handleAssignApplicationRoute(
  request: RouteRequest,
  deps: RouteDependencies,
  applicationId: string,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "POST") throw new BffError("NOT_FOUND");
    if (!originIsAllowed(request.headers.origin, deps.appOrigin))
      throw new BffError("FORBIDDEN");
    if (!applicationId) throw new BffError("VALIDATION_ERROR");

    const sessionToken = requireSessionToken(request);
    const csrfToken = requireCsrfToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    const limit = await deps.rateLimiter.check("applications-write", rateKey);
    if (!limit.allowed) throw new BffError("RATE_LIMITED");

    const body = parseBody(request.body);
    if (
      typeof body.version !== "number" ||
      typeof body.processorId !== "string"
    )
      throw new BffError("VALIDATION_ERROR");

    const result = await deps.appsScriptCrud.execute("applications_assign", {
      session_token: sessionToken,
      csrf_token: csrfToken,
      application_id: applicationId,
      version: body.version,
      processor_id: body.processorId,
    });

    return jsonSuccess(requestId, { application: result.data });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}
