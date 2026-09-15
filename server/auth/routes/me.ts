import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
} from "../apps-script-client";
import {
  clearSessionCookie,
  parseCookies,
  SESSION_COOKIE_NAME,
} from "../cookies";
import { BffError } from "../http-envelope";
import { privacyKeyFor } from "../rate-limit";
import { jsonFailure, jsonSuccess } from "../respond";
import { roleRedirectFor } from "../roles";
import type {
  RouteDependencies,
  RouteRequest,
  RouteResponse,
} from "../route-types";

export async function handleMeRoute(
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
    // Rate-limit outage does not block `me`; Apps Script remains the
    // authoritative check, so this bucket is best-effort only.
    try {
      const limit = await deps.rateLimiter.check("me", sessionKey);
      if (!limit.allowed) throw new BffError("RATE_LIMITED");
    } catch (error) {
      if (error instanceof BffError) throw error;
    }

    const result = await deps.appsScript.execute("validate_session", {
      session_token: sessionToken,
    });

    const redirectTo = roleRedirectFor(result.role);
    if (!redirectTo || !result.userId) throw new BffError("SESSION_EXPIRED");

    const now = deps.clock.now();
    return jsonSuccess(requestId, {
      user: { fullName: "", role: result.role },
      session: {
        idleExpiresAt: new Date(
          now.getTime() + deps.sessionIdleSeconds * 1000,
        ).toISOString(),
        absoluteExpiresAt: new Date(
          now.getTime() + deps.sessionAbsoluteSeconds * 1000,
        ).toISOString(),
      },
      redirectTo,
    });
  } catch (error) {
    return jsonFailure(requestId, mapMeError(error), maybeClearSession(error));
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

function mapMeError(error: unknown): unknown {
  if (error instanceof BffError) return error;
  if (error instanceof AppsScriptUnavailableError)
    return new BffError("AUTH_SERVICE_UNAVAILABLE");
  if (error instanceof AppsScriptDeniedError)
    return new BffError("SESSION_EXPIRED");
  return new BffError("INTERNAL_ERROR");
}
