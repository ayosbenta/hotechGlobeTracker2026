import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
} from "../apps-script-client";
import {
  clearSessionCookie,
  CSRF_COOKIE_NAME,
  csrfCookie,
  parseCookies,
  SESSION_COOKIE_NAME,
} from "../cookies";
import { BffError } from "../http-envelope";
import { privacyKeyFor, RateLimitUnavailableError } from "../rate-limit";
import { jsonFailure, jsonSuccess } from "../respond";
import type {
  RouteDependencies,
  RouteRequest,
  RouteResponse,
} from "../route-types";

export async function handleCsrfRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "GET") throw new BffError("NOT_FOUND");

    const cookies = parseCookies(request.cookieHeader);
    const sessionToken = cookies[SESSION_COOKIE_NAME];
    if (!sessionToken) throw new BffError("AUTH_REQUIRED");

    const sessionKey = privacyKeyFor(deps, sessionToken);
    const limit = await deps.rateLimiter.check("csrf", sessionKey);
    if (!limit.allowed) throw new BffError("RATE_LIMITED");

    // Apps Script's issue_csrf operation authenticates the caller's current
    // CSRF secret before rotating it; a first-ever call with no existing
    // cookie has no current token to present and is denied, matching a
    // fresh session's requirement to have already received one at login.
    const currentCsrfToken = cookies[CSRF_COOKIE_NAME];
    if (!currentCsrfToken) throw new BffError("AUTH_REQUIRED");

    const nextCsrfToken = deps.randomToken(32);
    const result = await deps.appsScript.execute("issue_csrf", {
      session_token: sessionToken,
      csrf_token: currentCsrfToken,
      next_csrf_token: nextCsrfToken,
    });

    if (!result.sessionId) throw new BffError("SESSION_EXPIRED");

    return jsonSuccess(requestId, { csrfToken: nextCsrfToken }, [
      csrfCookie(nextCsrfToken, deps.sessionAbsoluteSeconds),
    ]);
  } catch (error) {
    return jsonFailure(
      requestId,
      mapCsrfError(error),
      maybeClearSession(error),
    );
  }
}

function maybeClearSession(error: unknown): string[] {
  if (
    error instanceof BffError &&
    (error.code === "SESSION_EXPIRED" || error.code === "AUTH_REQUIRED")
  )
    return [clearSessionCookie()];
  if (error instanceof AppsScriptDeniedError) return [clearSessionCookie()];
  return [];
}

function mapCsrfError(error: unknown): unknown {
  if (error instanceof BffError) return error;
  if (error instanceof RateLimitUnavailableError)
    return new BffError("UPSTREAM_UNAVAILABLE");
  if (error instanceof AppsScriptUnavailableError)
    return new BffError("UPSTREAM_UNAVAILABLE");
  if (error instanceof AppsScriptDeniedError)
    return new BffError("SESSION_EXPIRED");
  return new BffError("INTERNAL_ERROR");
}
