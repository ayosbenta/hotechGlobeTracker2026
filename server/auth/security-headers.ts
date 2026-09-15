export interface SecurityHeaderOptions {
  isHttps: boolean;
}

/**
 * Approved browser-facing security headers for BFF auth responses.
 * CSP is intentionally restrictive; GIS script/frame/connect/style origins
 * are the only third-party allowances, per the Phase 03C plan.
 */
export function authSecurityHeaders(
  options: SecurityHeaderOptions,
): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com",
    "style-src 'self' https://accounts.google.com",
    "frame-src https://accounts.google.com",
    "connect-src 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");

  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
  if (options.isHttps) {
    headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}
