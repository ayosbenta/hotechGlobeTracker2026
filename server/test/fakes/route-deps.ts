import { vi } from "vitest";

import type {
  AppsScriptAuthClient,
  AppsScriptAuthResult,
} from "../../auth/apps-script-client";
import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
} from "../../auth/apps-script-client";
import {
  nodeCryptoAdapter,
  randomToken,
  sha256Base64Url,
} from "../../auth/crypto";
import type {
  GoogleIdTokenVerifier,
  VerifiedGoogleIdentity,
} from "../../auth/google-verifier";
import { isPermittedGoogleAccountDomain } from "../../auth/google-verifier";
import type { NonceStore } from "../../auth/nonce-store";
import { RateLimitUnavailableError } from "../../auth/rate-limit";
import type { RateLimiter } from "../../auth/rate-limit";
import type { RouteDependencies } from "../../auth/route-types";

export { AppsScriptDeniedError, AppsScriptUnavailableError };

export function fakeAllowAllRateLimiter(): RateLimiter {
  return { check: vi.fn(async () => ({ allowed: true })) };
}

export function fakeDenyingRateLimiter(): RateLimiter {
  return { check: vi.fn(async () => ({ allowed: false })) };
}

export function fakeOutageRateLimiter(): RateLimiter {
  return {
    check: vi.fn(async () => {
      throw new RateLimitUnavailableError();
    }),
  };
}

export function fakeInMemoryNonceStore(): NonceStore {
  const store = new Map<string, string>();
  return {
    async create() {
      const loginToken = randomToken(32);
      const nonce = randomToken(32);
      store.set(loginToken, sha256Base64Url(nonce));
      return { loginToken, nonce, createdAt: new Date().toISOString() };
    },
    async peek(loginToken) {
      const nonceHash = store.get(loginToken);
      return nonceHash === undefined ? null : { nonceHash };
    },
    async consumeIfMatches(loginToken, expectedNonceHash) {
      const stored = store.get(loginToken);
      if (stored === undefined || stored !== expectedNonceHash) return false;
      store.delete(loginToken);
      return true;
    },
    async discard(loginToken) {
      store.delete(loginToken);
    },
  };
}

export function fakeGoogleVerifier(
  identity: VerifiedGoogleIdentity | Error,
): GoogleIdTokenVerifier {
  return {
    async verify() {
      if (identity instanceof Error) throw identity;
      return identity;
    },
  };
}

export function fakeAppsScriptClient(
  result: AppsScriptAuthResult | Error,
): AppsScriptAuthClient {
  return {
    async execute() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

export function baseRouteDependencies(
  overrides: Partial<RouteDependencies> = {},
): RouteDependencies {
  return {
    clock: { now: () => new Date("2026-09-15T00:00:00.000Z") },
    requestId: { generate: () => "test-request-id" },
    randomToken,
    crypto: nodeCryptoAdapter,
    googleVerifier: fakeGoogleVerifier(new Error("not configured")),
    nonceStore: fakeInMemoryNonceStore(),
    rateLimiter: fakeAllowAllRateLimiter(),
    appsScript: fakeAppsScriptClient(new Error("not configured")),
    rateLimitKeySecret: "r".repeat(32),
    sessionIdleSeconds: 1800,
    sessionAbsoluteSeconds: 28800,
    appOrigin: "https://app.example.com",
    isPermittedGoogleAccountDomain,
    ...overrides,
  };
}
