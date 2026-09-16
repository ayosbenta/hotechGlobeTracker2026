import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

import { verifyAdminCredentials } from "./admin-credentials.js";
import { createAppsScriptAuthClient } from "./apps-script-client.js";
import { createAppsScriptCrudClient } from "../crud/apps-script-crud-client.js";
import { nodeCryptoAdapter, randomToken } from "./crypto.js";
import { loadServerAuthEnv, type ServerAuthEnv } from "./env.js";
import { createUpstashRateLimiter } from "./rate-limit.js";
import type { RouteDependencies } from "./route-types.js";

const SESSION_IDLE_SECONDS = 1800;
const SESSION_ABSOLUTE_SECONDS = 28800;

export function buildRouteDependencies(
  env: ServerAuthEnv = loadServerAuthEnv(),
): RouteDependencies {
  const redis = new Redis({
    url: env.upstashRedisRestUrl,
    token: env.upstashRedisRestToken,
  });
  const activeKey = env.internalHmacKeys.get(env.internalHmacActiveKeyId);
  if (!activeKey)
    throw new Error("Active internal HMAC key is not configured.");

  const appsScript = createAppsScriptAuthClient(
    {
      internalUrl: env.appsScriptInternalUrl,
      audience: env.internalAudience,
      signingKey: {
        keyId: env.internalHmacActiveKeyId,
        secret: activeKey.secret,
      },
    },
    nodeCryptoAdapter,
    { now: () => new Date() },
  );

  const appsScriptCrud = createAppsScriptCrudClient(
    {
      internalUrl: env.appsScriptCrudUrl,
      audience: env.internalAudience,
      signingKey: {
        keyId: env.internalHmacActiveKeyId,
        secret: activeKey.secret,
      },
    },
    nodeCryptoAdapter,
    { now: () => new Date() },
  );

  return {
    clock: { now: () => new Date() },
    requestId: { generate: () => randomUUID() },
    randomToken,
    crypto: nodeCryptoAdapter,
    adminLogin: {
      email: env.adminEmail,
      providerSubject: env.adminProviderSubject,
      verify: verifyAdminCredentials,
    },
    rateLimiter: createUpstashRateLimiter(redis),
    appsScript,
    appsScriptCrud,
    rateLimitKeySecret: env.rateLimitKeySecret,
    sessionIdleSeconds: SESSION_IDLE_SECONDS,
    sessionAbsoluteSeconds: SESSION_ABSOLUTE_SECONDS,
    appOrigin: env.appOrigin,
  };
}

let cached: RouteDependencies | undefined;

/**
 * Reuses one dependency graph (Redis client, rate limiters, Apps Script
 * clients) across warm invocations of the same serverless
 * instance. A failed build is never cached, so a misconfigured environment
 * keeps failing closed on every call rather than being remembered as good.
 */
export function createRouteDependencies(): RouteDependencies {
  if (!cached) cached = buildRouteDependencies();
  return cached;
}
