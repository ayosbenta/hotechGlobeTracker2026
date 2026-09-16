export interface SecurityHeaderOptions {
  isHttps: boolean;
}

/**
 * Approved browser-facing security headers for BFF auth responses.
 * CSP is intentionally restrictive and allows no third-party origins.
 */
export function authSecurityHeaders(
  options: SecurityHeaderOptions,
): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "frame-src 'none'",
    "connect-src 'self'",
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
