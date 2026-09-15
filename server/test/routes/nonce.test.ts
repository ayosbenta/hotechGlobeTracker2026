import { describe, expect, it } from "vitest";

import { handleNonceRoute } from "../../auth/routes/nonce";
import {
  baseRouteDependencies,
  fakeDenyingRateLimiter,
  fakeOutageRateLimiter,
} from "../fakes/route-deps";

function request(method = "POST"): Parameters<typeof handleNonceRoute>[0] {
  return {
    method,
    cookieHeader: null,
    headers: {},
    body: {},
    clientIp: "203.0.113.1",
  };
}

describe("POST /api/auth/nonce", () => {
  it("returns 200 with a nonce, expiry, and login cookie on success", async () => {
    const response = await handleNonceRoute(request(), baseRouteDependencies());
    expect(response.status).toBe(200);
    const body = response.body as {
      ok: true;
      data: { nonce: string; expiresAt: string };
    };
    expect(body.ok).toBe(true);
    expect(typeof body.data.nonce).toBe("string");
    expect(typeof body.data.expiresAt).toBe("string");
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_login=")),
    ).toBe(true);
  });

  it("sets Cache-Control: no-store", async () => {
    const response = await handleNonceRoute(request(), baseRouteDependencies());
    expect(response.headers["Cache-Control"]).toBe("no-store");
  });

  it("rejects non-POST methods with 404", async () => {
    const response = await handleNonceRoute(
      request("GET"),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(404);
  });

  it("returns 429 when the rate limiter denies the request", async () => {
    const response = await handleNonceRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeDenyingRateLimiter() }),
    );
    expect(response.status).toBe(429);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "RATE_LIMITED",
    );
  });

  it("fails closed with 502 when Redis/rate-limit is unavailable", async () => {
    const response = await handleNonceRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeOutageRateLimiter() }),
    );
    expect(response.status).toBe(502);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });

  it("never exposes stack traces, secrets, or internal details in the failure body", async () => {
    const response = await handleNonceRoute(
      request(),
      baseRouteDependencies({ rateLimiter: fakeOutageRateLimiter() }),
    );
    const raw = JSON.stringify(response.body);
    expect(raw).not.toMatch(/at\s+\w+\s+\(/);
    expect(raw).not.toContain("Error:");
  });

  it("allows a request with no Origin header (same-site default)", async () => {
    const response = await handleNonceRoute(request(), baseRouteDependencies());
    expect(response.status).toBe(200);
  });

  it("allows a request whose Origin header matches the configured app origin", async () => {
    const response = await handleNonceRoute(
      { ...request(), headers: { origin: "https://app.example.com" } },
      baseRouteDependencies(),
    );
    expect(response.status).toBe(200);
  });

  it("rejects a request whose Origin header does not match (defense-in-depth)", async () => {
    const response = await handleNonceRoute(
      { ...request(), headers: { origin: "https://evil.example.com" } },
      baseRouteDependencies(),
    );
    expect(response.status).toBe(403);
  });
});
