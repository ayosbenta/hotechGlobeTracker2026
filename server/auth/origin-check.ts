/**
 * Defense-in-depth only: CSRF double-submit is the actual authentication
 * boundary (CORS/Origin headers are not authentication). When an Origin
 * header is present on a state-changing request, it must match the
 * configured app origin; an absent Origin header (common for legitimate
 * same-site requests in some browsers/proxies) is not rejected on this
 * check alone.
 */
export function originIsAllowed(
  origin: string | string[] | undefined,
  appOrigin: string,
): boolean {
  if (origin === undefined) return true;
  const value = Array.isArray(origin) ? origin[0] : origin;
  return value === appOrigin;
}
