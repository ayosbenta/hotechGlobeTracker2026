import { vi } from "vitest";

import type {
  AppsScriptAuthClient,
  AppsScriptAuthResult,
} from "../../auth/apps-script-client";
import {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
} from "../../auth/apps-script-client";
import type {
  AppsScriptCrudClient,
  AppsScriptCrudResult,
} from "../../crud/apps-script-crud-client";
import {
  AppsScriptDeniedError as CrudAppsScriptDeniedError,
  AppsScriptUnavailableError as CrudAppsScriptUnavailableError,
} from "../../crud/apps-script-crud-client";
import { nodeCryptoAdapter, randomToken } from "../../auth/crypto";
import { RateLimitUnavailableError } from "../../auth/rate-limit";
import type { RateLimiter } from "../../auth/rate-limit";
import type { AdminLogin, RouteDependencies } from "../../auth/route-types";

export {
  AppsScriptDeniedError,
  AppsScriptUnavailableError,
  CrudAppsScriptDeniedError,
  CrudAppsScriptUnavailableError,
};

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

export function fakeAdminLogin(
  overrides: Partial<AdminLogin> = {},
): AdminLogin {
  return {
    email: "admin@example.com",
    providerSubject: "password:ryanzkey",
    verify: vi.fn(
      async (username: string, password: string) =>
        username === "ryanzkey" && password === "correct-password",
    ),
    ...overrides,
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

export function fakeAppsScriptCrudClient(
  result: AppsScriptCrudResult | Error,
): AppsScriptCrudClient {
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
    adminLogin: fakeAdminLogin(),
    rateLimiter: fakeAllowAllRateLimiter(),
    appsScript: fakeAppsScriptClient(new Error("not configured")),
    appsScriptCrud: fakeAppsScriptCrudClient(new Error("not configured")),
    rateLimitKeySecret: "r".repeat(32),
    sessionIdleSeconds: 1800,
    sessionAbsoluteSeconds: 28800,
    appOrigin: "https://app.example.com",
    ...overrides,
  };
}
