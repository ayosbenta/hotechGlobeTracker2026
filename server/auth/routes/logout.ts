import {
  clearCsrfCookie,
  clearLoginCookie,
  clearSessionCookie,
  CSRF_HEADER_NAME,
  parseCookies,
  SESSION_COOKIE_NAME,
} from "../cookies.js";
import { verifyCsrfDoubleSubmit } from "../csrf.js";
import { BffError } from "../http-envelope.js";
import { originIsAllowed } from "../origin-check.js";
import { privacyKeyFor } from "../rate-limit.js";
import { jsonFailure, jsonSuccess } from "../respond.js";
import type {
  RouteDependencies,
  RouteRequest,
  RouteResponse,
} from "../route-types.js";

const LOGOUT_CLEAR_COOKIES = [
  clearSessionCookie(),
  clearCsrfCookie(),
  clearLoginCookie(),
];

/**
 * Logout is safe and idempotent: cookies are always cleared, even if the
 * session token is missing, already invalid, or Apps Script is unavailable.
 * Authoritative revocation is attempted whenever a session token is present.
 */
export async function handleLogoutRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  const cookies = parseCookies(request.cookieHeader);
  const sessionToken = cookies[SESSION_COOKIE_NAME];

  if (request.method !== "POST") {
    return jsonFailure(
      requestId,
      new BffError("NOT_FOUND"),
      LOGOUT_CLEAR_COOKIES,
    );
  }

  if (!sessionToken) {
    return jsonSuccess(requestId, { loggedOut: true }, LOGOUT_CLEAR_COOKIES);
  }

  if (!originIsAllowed(request.headers.origin, deps.appOrigin)) {
    return jsonFailure(
      requestId,
      new BffError("FORBIDDEN"),
      LOGOUT_CLEAR_COOKIES,
    );
  }

  const csrfToken = verifyCsrfDoubleSubmit({
    cookieHeader: request.cookieHeader,
    headerValue: request.headers[CSRF_HEADER_NAME],
  });
  if (csrfToken === null) {
    return jsonFailure(
      requestId,
      new BffError("FORBIDDEN"),
      LOGOUT_CLEAR_COOKIES,
    );
  }

  try {
    const sessionKey = privacyKeyFor(deps, sessionToken);
    try {
      const limit = await deps.rateLimiter.check("logout", sessionKey);
      if (!limit.allowed) throw new BffError("RATE_LIMITED");
    } catch (error) {
      if (error instanceof BffError) throw error;
      // Rate-limit outage never blocks logout.
    }

    await deps.appsScript.execute("logout", {
      session_token: sessionToken,
      csrf_token: csrfToken,
    });
  } catch (error) {
    if (error instanceof BffError && error.code === "RATE_LIMITED") {
      return jsonFailure(requestId, error, LOGOUT_CLEAR_COOKIES);
    }
    // Any other authoritative-revocation failure (denied or unavailable)
    // still results in cookies being cleared, per the idempotent-logout rule.
  }

  return jsonSuccess(requestId, { loggedOut: true }, LOGOUT_CLEAR_COOKIES);
}
