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

interface PlanRequestBody {
  planName?: unknown;
  monthlyPrice?: unknown;
  speedMbps?: unknown;
  planStatus?: unknown;
  expectedUpdatedAt?: unknown;
}

function parseBody(body: unknown): PlanRequestBody {
  if (body === null || typeof body !== "object") return {};
  return body as PlanRequestBody;
}

/** GET /api/plans — Admin, Agent, Processor (Agent/Processor see plan_status=Active only, enforced by Apps Script from the session role). */
export async function handleListPlansRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "GET") throw new BffError("NOT_FOUND");
    const sessionToken = requireSessionToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    try {
      const limit = await deps.rateLimiter.check("plans-read", rateKey);
      if (!limit.allowed) throw new BffError("RATE_LIMITED");
    } catch (error) {
      if (error instanceof BffError) throw error;
      // A rate-limiter outage never blocks a read.
    }

    const cursor =
      typeof request.body === "object" &&
      request.body !== null &&
      "cursor" in (request.body as Record<string, unknown>)
        ? (request.body as Record<string, unknown>).cursor
        : undefined;

    const result = await deps.appsScriptCrud.execute("plans_list", {
      session_token: sessionToken,
      ...(typeof cursor === "string" ? { cursor } : {}),
    });

    return jsonSuccess(requestId, {
      plans: result.data,
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

/** POST /api/plans — Admin only. */
export async function handleCreatePlanRoute(
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
    const limit = await deps.rateLimiter.check("plans-write", rateKey);
    if (!limit.allowed) throw new BffError("RATE_LIMITED");

    const body = parseBody(request.body);
    if (
      typeof body.planName !== "string" ||
      typeof body.monthlyPrice !== "number" ||
      typeof body.speedMbps !== "number"
    )
      throw new BffError("VALIDATION_ERROR");

    const result = await deps.appsScriptCrud.execute("plans_create", {
      session_token: sessionToken,
      csrf_token: csrfToken,
      plan_name: body.planName,
      monthly_price: body.monthlyPrice,
      speed_mbps: body.speedMbps,
      ...(typeof body.planStatus === "string"
        ? { plan_status: body.planStatus }
        : {}),
    });

    return jsonSuccess(requestId, { plan: result.data });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}

/** PATCH /api/plans/:planId — Admin only, optimistic concurrency via expectedUpdatedAt. */
export async function handleUpdatePlanRoute(
  request: RouteRequest,
  deps: RouteDependencies,
  planId: string,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "PATCH") throw new BffError("NOT_FOUND");
    if (!originIsAllowed(request.headers.origin, deps.appOrigin))
      throw new BffError("FORBIDDEN");
    if (!planId) throw new BffError("VALIDATION_ERROR");

    const sessionToken = requireSessionToken(request);
    const csrfToken = requireCsrfToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    const limit = await deps.rateLimiter.check("plans-write", rateKey);
    if (!limit.allowed) throw new BffError("RATE_LIMITED");

    const body = parseBody(request.body);
    if (
      typeof body.expectedUpdatedAt !== "string" ||
      body.expectedUpdatedAt === ""
    )
      throw new BffError("VALIDATION_ERROR");

    const payload: Record<string, unknown> = {
      session_token: sessionToken,
      csrf_token: csrfToken,
      plan_id: planId,
      expected_updated_at: body.expectedUpdatedAt,
    };
    if (body.planName !== undefined) {
      if (typeof body.planName !== "string")
        throw new BffError("VALIDATION_ERROR");
      payload.plan_name = body.planName;
    }
    if (body.monthlyPrice !== undefined) {
      if (typeof body.monthlyPrice !== "number")
        throw new BffError("VALIDATION_ERROR");
      payload.monthly_price = body.monthlyPrice;
    }
    if (body.speedMbps !== undefined) {
      if (typeof body.speedMbps !== "number")
        throw new BffError("VALIDATION_ERROR");
      payload.speed_mbps = body.speedMbps;
    }
    if (body.planStatus !== undefined) {
      if (typeof body.planStatus !== "string")
        throw new BffError("VALIDATION_ERROR");
      payload.plan_status = body.planStatus;
    }

    const result = await deps.appsScriptCrud.execute("plans_update", payload);

    return jsonSuccess(requestId, { plan: result.data });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}
