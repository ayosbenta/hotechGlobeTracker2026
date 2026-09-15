import { describe, expect, it } from "vitest";

import { authSecurityHeaders } from "../auth/security-headers";

describe("security headers", () => {
  it("includes the approved header set", () => {
    const headers = authSecurityHeaders({ isHttps: true });
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("base-uri 'none'");
    expect(headers["Content-Security-Policy"]).toContain("form-action 'self'");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("sets HSTS only when isHttps is true", () => {
    expect(
      authSecurityHeaders({ isHttps: true })["Strict-Transport-Security"],
    ).toBeDefined();
    expect(
      authSecurityHeaders({ isHttps: false })["Strict-Transport-Security"],
    ).toBeUndefined();
  });
});
