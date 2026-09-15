import { loginCookie } from "../cookies";
import { BffError } from "../http-envelope";
import { originIsAllowed } from "../origin-check";
import { jsonFailure, jsonSuccess } from "../respond";
import { privacyKeyFor } from "../rate-limit";
import type {
  RouteDependencies,
  RouteRequest,
  RouteResponse,
} from "../route-types";

const NONCE_MAX_AGE_SECONDS = 300;

export async function handleNonceRoute(
  request: RouteRequest,
  deps: RouteDependencies,
): Promise<RouteResponse> {
  const requestId = deps.requestId.generate();
  try {
    if (request.method !== "POST") throw new BffError("NOT_FOUND");
    if (!originIsAllowed(request.headers.origin, deps.appOrigin))
      throw new BffError("FORBIDDEN");

    const ipKey = privacyKeyFor(deps, request.clientIp);
    const [minute, hour] = await Promise.all([
      deps.rateLimiter.check("nonce-minute", ipKey),
      deps.rateLimiter.check("nonce-hour", ipKey),
    ]);
    if (!minute.allowed || !hour.allowed) throw new BffError("RATE_LIMITED");

    const transaction = await deps.nonceStore.create();

    return jsonSuccess(
      requestId,
      {
        nonce: transaction.nonce,
        expiresAt: new Date(
          Date.now() + NONCE_MAX_AGE_SECONDS * 1000,
        ).toISOString(),
      },
      [loginCookie(transaction.loginToken, NONCE_MAX_AGE_SECONDS)],
    );
  } catch (error) {
    return jsonFailure(requestId, mapNonceError(error));
  }
}

function mapNonceError(error: unknown): unknown {
  if (error instanceof BffError) return error;
  // Redis/nonce-store outages fail closed for the nonce route.
  return new BffError("UPSTREAM_UNAVAILABLE");
}
