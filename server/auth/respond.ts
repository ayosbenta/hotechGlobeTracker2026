import { authSecurityHeaders } from "./security-headers.js";
import {
  BFF_STATUS_BY_CODE,
  BffError,
  bffFailure,
  bffSuccess,
} from "./http-envelope.js";
import type { RouteResponse } from "./route-types.js";

export function jsonSuccess<T>(
  requestId: string,
  data: T,
  cookies: string[] = [],
): RouteResponse {
  return {
    status: 200,
    headers: authSecurityHeaders({ isHttps: true }),
    cookies,
    body: bffSuccess(requestId, data),
  };
}

export function jsonFailure(
  requestId: string,
  error: unknown,
  cookies: string[] = [],
): RouteResponse {
  const code = error instanceof BffError ? error.code : "INTERNAL_ERROR";
  return {
    status: BFF_STATUS_BY_CODE[code],
    headers: authSecurityHeaders({ isHttps: true }),
    cookies,
    body: bffFailure(requestId, code),
  };
}
