import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
} from "../apps-script-client";
import {
  clearLoginCookie,
  LOGIN_COOKIE_NAME,
  parseCookies,
  sessionCookie,
  csrfCookie,
} from "../cookies";
import { GoogleVerificationError } from "../google-verifier";
import { BffError } from "../http-envelope";
import { NonceStoreUnavailableError } from "../nonce-store";
import { originIsAllowed } from "../origin-check";
import { privacyKeyFor, RateLimitUnavailableError } from "../rate-limit";
import { jsonFailure, jsonSuccess } from "../respond";
import { roleRedirectFor } from "../roles";
import type {
  RouteDependencies,
  RouteRequest,
  RouteResponse,
} from "../route-types";

interface LoginRequestBody {
  credential: string;
}

function parseBody(body: unknown): LoginRequestBody {
  if (
    body === null ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).credential !== "string" ||
    (body as Record<string, unknown>).credential === ""
  )
    throw new BffError("VALIDATION_ERROR");
  return { credential: (body as { credential: string }).credential };
}

export async function handleLoginRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  const cookies = parseCookies(request.cookieHeader);
  const loginToken = cookies[LOGIN_COOKIE_NAME];
  let clearLogin = false;

  try {
    if (request.method !== "POST") throw new BffError("NOT_FOUND");
    if (!originIsAllowed(request.headers.origin, deps.appOrigin))
      throw new BffError("FORBIDDEN");

    const ipKey = privacyKeyFor(deps, request.clientIp);
    const ipLimit = await deps.rateLimiter.check("login-ip", ipKey);
    if (!ipLimit.allowed) throw new BffError("RATE_LIMITED");

    const { credential } = parseBody(request.body);
    if (!loginToken) throw new BffError("VALIDATION_ERROR");

    const transaction = await deps.nonceStore.peek(loginToken);
    if (transaction === null) throw new BffError("VALIDATION_ERROR");

    // Verify the Google credential first; the transaction is not consumed
    // until both the credential and its nonce claim are confirmed valid.
    const identity = await deps.googleVerifier.verify(credential);

    if (deps.crypto.sha256(identity.nonce) !== transaction.nonceHash)
      throw new GoogleVerificationError();

    if (!deps.isPermittedGoogleAccountDomain(identity)) {
      clearLogin = true;
      await deps.nonceStore.discard(loginToken);
      throw new BffError("FORBIDDEN");
    }

    const consumed = await deps.nonceStore.consumeIfMatches(
      loginToken,
      transaction.nonceHash,
    );
    clearLogin = true;
    if (!consumed) throw new BffError("REPLAY_OR_CONFLICT");

    const subKey = privacyKeyFor(deps, identity.sub);
    const subLimit = await deps.rateLimiter.check("login-sub", subKey);
    if (!subLimit.allowed) throw new BffError("RATE_LIMITED");

    const sessionToken = deps.randomToken(32);
    const csrfToken = deps.randomToken(32);

    const result = await deps.appsScript.execute("login_first_bind", {
      email: identity.email,
      sub: identity.sub,
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
        clearLoginCookie(),
        sessionCookie(sessionToken, deps.sessionAbsoluteSeconds),
        csrfCookie(csrfToken, deps.sessionAbsoluteSeconds),
      ],
    );
  } catch (error) {
    const cookieClears = clearLogin || loginToken ? [clearLoginCookie()] : [];
    return jsonFailure(requestId, mapLoginError(error), cookieClears);
  }
}

function mapLoginError(error: unknown): unknown {
  if (error instanceof BffError) return error;
  if (error instanceof GoogleVerificationError)
    return new BffError("VALIDATION_ERROR");
  if (error instanceof NonceStoreUnavailableError)
    return new BffError("UPSTREAM_UNAVAILABLE");
  if (error instanceof RateLimitUnavailableError)
    return new BffError("UPSTREAM_UNAVAILABLE");
  if (error instanceof AppsScriptUnavailableError)
    return new BffError("AUTH_SERVICE_UNAVAILABLE");
  if (error instanceof AppsScriptDeniedError) return new BffError("FORBIDDEN");
  return new BffError("INTERNAL_ERROR");
}
