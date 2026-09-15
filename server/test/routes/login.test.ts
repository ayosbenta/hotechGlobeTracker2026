import { describe, expect, it } from "vitest";

import { sha256Base64Url } from "../../auth/crypto";
import { GoogleVerificationError } from "../../auth/google-verifier";
import { handleLoginRoute } from "../../auth/routes/login";
import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
  baseRouteDependencies,
  fakeAppsScriptClient,
  fakeDenyingRateLimiter,
  fakeGoogleVerifier,
  fakeInMemoryNonceStore,
  fakeOutageRateLimiter,
} from "../fakes/route-deps";

async function withTransaction() {
  const nonceStore = fakeInMemoryNonceStore();
  const tx = await nonceStore.create();
  return { nonceStore, tx };
}

function request(
  overrides: Partial<Parameters<typeof handleLoginRoute>[0]> = {},
) {
  return {
    method: "POST",
    cookieHeader: null,
    headers: {},
    body: { credential: "id-token" },
    clientIp: "203.0.113.1",
    ...overrides,
  };
}

describe("POST /api/auth/login", () => {
  it("returns 400 when the credential field is missing", async () => {
    const response = await handleLoginRoute(
      request({ body: {} }),
      baseRouteDependencies(),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when the login cookie is missing", async () => {
    const response = await handleLoginRoute(request(), baseRouteDependencies());
    expect(response.status).toBe(400);
  });

  it("returns 400 and clears the login cookie on Google verification failure", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        googleVerifier: fakeGoogleVerifier(new GoogleVerificationError()),
      }),
    );
    expect(response.status).toBe(400);
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_login=; ")),
    ).toBe(true);
  });

  it("returns 400 when the ID token's nonce claim does not match the stored nonce", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        googleVerifier: fakeGoogleVerifier({
          sub: "sub-1",
          email: "user@gmail.com",
          emailVerified: true,
          hostedDomain: null,
          nonce: "wrong-nonce",
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("denies a verified third-party-domain Google account (no hd, not gmail.com)", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        googleVerifier: fakeGoogleVerifier({
          sub: "sub-1",
          email: "user@untrusted-domain.example",
          emailVerified: true,
          hostedDomain: null,
          nonce: tx.nonce,
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "FORBIDDEN",
    );
  });

  it("succeeds for a verified gmail.com identity and sets session/csrf cookies", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        googleVerifier: fakeGoogleVerifier({
          sub: "sub-1",
          email: "user@gmail.com",
          emailVerified: true,
          hostedDomain: null,
          nonce: tx.nonce,
        }),
        appsScript: fakeAppsScriptClient({
          userId: "u1",
          role: "Agent",
          sessionId: "s1",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = response.body as {
      ok: true;
      data: { user: { role: string }; redirectTo: string };
    };
    expect(body.data.user.role).toBe("Agent");
    expect(body.data.redirectTo).toBe("/agent/dashboard");
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_session=")),
    ).toBe(true);
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_csrf=")),
    ).toBe(true);
    expect(
      response.cookies.some((c) => c.startsWith("__Host-hotech_login=; ")),
    ).toBe(true);
  });

  it("prevents replay: a second login attempt with the same login cookie fails", async () => {
    const { nonceStore, tx } = await withTransaction();
    const deps = baseRouteDependencies({
      nonceStore,
      googleVerifier: fakeGoogleVerifier({
        sub: "sub-1",
        email: "user@gmail.com",
        emailVerified: true,
        hostedDomain: null,
        nonce: tx.nonce,
      }),
      appsScript: fakeAppsScriptClient({
        userId: "u1",
        role: "Agent",
        sessionId: "s1",
      }),
    });
    const cookieHeader = `__Host-hotech_login=${tx.loginToken}`;
    const first = await handleLoginRoute(request({ cookieHeader }), deps);
    const second = await handleLoginRoute(request({ cookieHeader }), deps);
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
  });

  it("only allows one winner under concurrent login attempts for the same transaction", async () => {
    const { nonceStore, tx } = await withTransaction();
    const deps = baseRouteDependencies({
      nonceStore,
      googleVerifier: fakeGoogleVerifier({
        sub: "sub-1",
        email: "user@gmail.com",
        emailVerified: true,
        hostedDomain: null,
        nonce: tx.nonce,
      }),
      appsScript: fakeAppsScriptClient({
        userId: "u1",
        role: "Agent",
        sessionId: "s1",
      }),
    });
    const cookieHeader = `__Host-hotech_login=${tx.loginToken}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        handleLoginRoute(request({ cookieHeader }), deps),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it("returns 429 when the per-IP login rate limit is exceeded", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        rateLimiter: fakeDenyingRateLimiter(),
      }),
    );
    expect(response.status).toBe(429);
  });

  it("returns 503 when Apps Script is unavailable after verification", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        googleVerifier: fakeGoogleVerifier({
          sub: "sub-1",
          email: "user@gmail.com",
          emailVerified: true,
          hostedDomain: null,
          nonce: tx.nonce,
        }),
        appsScript: fakeAppsScriptClient(new AppsScriptUnavailableError()),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("returns 403 when Apps Script denies the first-bind", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        googleVerifier: fakeGoogleVerifier({
          sub: "sub-1",
          email: "user@gmail.com",
          emailVerified: true,
          hostedDomain: null,
          nonce: tx.nonce,
        }),
        appsScript: fakeAppsScriptClient(new AppsScriptDeniedError()),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("never leaks the Google sub, email, or raw tokens in the response body", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        googleVerifier: fakeGoogleVerifier({
          sub: "super-secret-subject",
          email: "user@gmail.com",
          emailVerified: true,
          hostedDomain: null,
          nonce: tx.nonce,
        }),
        appsScript: fakeAppsScriptClient({
          userId: "u1",
          role: "Agent",
          sessionId: "s1",
        }),
      }),
    );
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain("super-secret-subject");
    expect(raw).not.toContain("user@gmail.com");
    expect(raw).not.toContain(tx.nonce);
  });

  it("hashes the nonce hash comparison instead of trusting caller equality (sanity check)", async () => {
    const { nonceStore, tx } = await withTransaction();
    expect(sha256Base64Url(tx.nonce)).toBe(
      (await nonceStore.peek(tx.loginToken))?.nonceHash,
    );
  });

  it("fails closed with 502 UPSTREAM_UNAVAILABLE when the rate limiter is down", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        rateLimiter: fakeOutageRateLimiter(),
      }),
    );
    expect(response.status).toBe(502);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });

  it("discards the nonce transaction when the account domain is denied", async () => {
    const { nonceStore, tx } = await withTransaction();
    await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({
        nonceStore,
        googleVerifier: fakeGoogleVerifier({
          sub: "sub-1",
          email: "user@untrusted-domain.example",
          emailVerified: true,
          hostedDomain: null,
          nonce: tx.nonce,
        }),
      }),
    );
    expect(await nonceStore.peek(tx.loginToken)).toBeNull();
  });

  it("allows a request with no Origin header (same-site default)", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({ cookieHeader: `__Host-hotech_login=${tx.loginToken}` }),
      baseRouteDependencies({ nonceStore }),
    );
    // Still 400 (no matching Google verifier configured) but not 403 FORBIDDEN from an origin check.
    expect(response.status).not.toBe(403);
  });

  it("rejects a request whose Origin header does not match the configured app origin", async () => {
    const { nonceStore, tx } = await withTransaction();
    const response = await handleLoginRoute(
      request({
        cookieHeader: `__Host-hotech_login=${tx.loginToken}`,
        headers: { origin: "https://evil.example.com" },
      }),
      baseRouteDependencies({ nonceStore }),
    );
    expect(response.status).toBe(403);
  });
});
