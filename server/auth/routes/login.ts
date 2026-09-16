import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
} from "../apps-script-client";
import { sessionCookie, csrfCookie } from "../cookies";
import { BffError } from "../http-envelope";
import { originIsAllowed } from "../origin-check";
import { privacyKeyFor, RateLimitUnavailableError } from "../rate-limit";
import { jsonFailure, jsonSuccess } from "../respond";
import { roleRedirectFor } from "../roles";
import type {
  RouteDependencies,
  RouteRequest,
  RouteResponse,
} from "../route-types";

const MAX_FIELD_LENGTH = 256;

interface LoginRequestBody {
  username: string;
  password: string;
}

function nonEmptyField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (
    typeof value !== "string" ||
    value === "" ||
    value.length > MAX_FIELD_LENGTH
  )
    throw new BffError("VALIDATION_ERROR");
  return value;
}

function parseBody(body: unknown): LoginRequestBody {
  if (body === null || typeof body !== "object")
    throw new BffError("VALIDATION_ERROR");
  const record = body as Record<string, unknown>;
  return {
    username: nonEmptyField(record, "username"),
    password: nonEmptyField(record, "password"),
  };
}

export async function handleLoginRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();

  try {
    if (request.method !== "POST") throw new BffError("NOT_FOUND");
    if (!originIsAllowed(request.headers.origin, deps.appOrigin))
      throw new BffError("FORBIDDEN");

    const ipKey = privacyKeyFor(deps, request.clientIp);
    const ipLimit = await deps.rateLimiter.check("login-ip", ipKey);
    if (!ipLimit.allowed) throw new BffError("RATE_LIMITED");

    const { username, password } = parseBody(request.body);

    const userKey = privacyKeyFor(deps, username.trim().toLowerCase());
    const userLimit = await deps.rateLimiter.check("login-user", userKey);
    if (!userLimit.allowed) throw new BffError("RATE_LIMITED");

    if (!(await deps.adminLogin.verify(username, password)))
      throw new BffError("AUTH_REQUIRED");

    if (!deps.adminLogin.email) throw new BffError("AUTH_SERVICE_UNAVAILABLE");

    const sessionToken = deps.randomToken(32);
    const csrfToken = deps.randomToken(32);

    // Apps Script still owns session issuance; the password check above
    // replaces Google's verified-email assertion for the Admin's Users row.
    const result = await deps.appsScript.execute("login_first_bind", {
      email: deps.adminLogin.email,
      sub: deps.adminLogin.providerSubject,
      email_verified: true,
      session_token: sessionToken,
      csrf_token: csrfToken,
    });

    const redirectTo = roleRedirectFor(result.role);
    if (!redirectTo || !result.userId) throw new BffError("FORBIDDEN");

    return jsonSuccess(
      requestId,
      {
        user: { fullName: "", role: result.role },
        redirectTo,
      },
      [
        sessionCookie(sessionToken, deps.sessionAbsoluteSeconds),
        csrfCookie(csrfToken, deps.sessionAbsoluteSeconds),
      ],
    );
  } catch (error) {
    return jsonFailure(requestId, mapLoginError(error));
  }
}

function mapLoginError(error: unknown): unknown {
  if (error instanceof BffError) return error;
  if (error instanceof RateLimitUnavailableError)
    return new BffError("UPSTREAM_UNAVAILABLE");
  if (error instanceof AppsScriptUnavailableError)
    return new BffError("AUTH_SERVICE_UNAVAILABLE");
  if (error instanceof AppsScriptDeniedError) return new BffError("FORBIDDEN");
  return new BffError("INTERNAL_ERROR");
}
