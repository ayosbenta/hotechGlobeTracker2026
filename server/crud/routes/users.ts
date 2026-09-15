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

interface UserUpdateRequestBody {
  fullName?: unknown;
  mobileNumber?: unknown;
  role?: unknown;
  accountStatus?: unknown;
  expectedUpdatedAt?: unknown;
}

function parseBody(body: unknown): UserUpdateRequestBody {
  if (body === null || typeof body !== "object") return {};
  return body as UserUpdateRequestBody;
}

/** GET /api/users — Admin only, paginated/filterable (same pagination shape as /api/plans). */
export async function handleListUsersRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "GET") throw new BffError("NOT_FOUND");
    const sessionToken = requireSessionToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    try {
      const limit = await deps.rateLimiter.check("users-read", rateKey);
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
    if (typeof query.role === "string") payload.role = query.role;
    if (typeof query.accountStatus === "string")
      payload.account_status = query.accountStatus;

    const result = await deps.appsScriptCrud.execute("users_list", payload);

    return jsonSuccess(requestId, {
      users: result.data,
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

/**
 * PATCH /api/users/:userId — Admin only for role/account_status changes; any
 * authenticated user (Admin/Agent/Processor) may also update their OWN
 * full_name/mobile_number through this same route when userId matches their
 * own session (self-service profile fields). Apps Script is the sole
 * authority on whether the caller may make the requested change — this route
 * never pre-authorizes based on a client-supplied role claim.
 */
export async function handleUpdateUserRoute(
  request: RouteRequest,
  deps: RouteDependencies,
  userId: string,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "PATCH") throw new BffError("NOT_FOUND");
    if (!originIsAllowed(request.headers.origin, deps.appOrigin))
      throw new BffError("FORBIDDEN");
    if (!userId) throw new BffError("VALIDATION_ERROR");

    const sessionToken = requireSessionToken(request);
    const csrfToken = requireCsrfToken(request);

    const rateKey = privacyKeyFor(deps, sessionToken);
    const limit = await deps.rateLimiter.check("users-write", rateKey);
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
      user_id: userId,
      expected_updated_at: body.expectedUpdatedAt,
    };
    if (body.fullName !== undefined) {
      if (typeof body.fullName !== "string")
        throw new BffError("VALIDATION_ERROR");
      payload.full_name = body.fullName;
    }
    if (body.mobileNumber !== undefined) {
      if (typeof body.mobileNumber !== "string")
        throw new BffError("VALIDATION_ERROR");
      payload.mobile_number = body.mobileNumber;
    }
    if (body.role !== undefined) {
      if (typeof body.role !== "string") throw new BffError("VALIDATION_ERROR");
      payload.role = body.role;
    }
    if (body.accountStatus !== undefined) {
      if (typeof body.accountStatus !== "string")
        throw new BffError("VALIDATION_ERROR");
      payload.account_status = body.accountStatus;
    }

    const result = await deps.appsScriptCrud.execute("users_update", payload);

    return jsonSuccess(requestId, { user: result.data });
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCrudError(error),
      maybeClearSession(error),
    );
  }
}
