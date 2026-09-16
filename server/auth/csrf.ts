import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, parseCookies } from "./cookies.js";
import { constantTimeEquals } from "./crypto.js";

export interface CsrfCheckInput {
  cookieHeader: string | undefined | null;
  headerValue: string | string[] | undefined;
}

/**
 * Requires the CSRF cookie and X-CSRF-Token header to be present and equal.
 * CORS is not an authentication boundary; this check is mandatory for every
 * state-changing BFF route regardless of origin headers.
 */
export function verifyCsrfDoubleSubmit(input: CsrfCheckInput): string | null {
  const cookies = parseCookies(input.cookieHeader);
  const cookieToken = cookies[CSRF_COOKIE_NAME];
  const headerToken = Array.isArray(input.headerValue)
    ? input.headerValue[0]
    : input.headerValue;
  if (!cookieToken || !headerToken) return null;
  if (!constantTimeEquals(cookieToken, headerToken)) return null;
  return cookieToken;
}

export { CSRF_HEADER_NAME };
