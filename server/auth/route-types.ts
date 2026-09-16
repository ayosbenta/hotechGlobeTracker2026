import type { AppsScriptAuthClient } from "./apps-script-client";
import type { AppsScriptCrudClient } from "../crud/apps-script-crud-client";
import type { CryptoAdapter } from "./crypto";
import type { RateLimiter } from "./rate-limit";

export interface RouteRequest {
  method: string;
  cookieHeader: string | undefined | null;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  /** Already-extracted, already-hashed-upstream client IP for rate limiting only. */
  clientIp: string;
}

export interface RouteResponse {
  status: number;
  headers: Record<string, string>;
  /** Cookie strings to append via multiple Set-Cookie headers. */
  cookies: string[];
  body: unknown;
}

export interface AdminLogin {
  /** Email of the Admin's pre-provisioned Users row; null when unconfigured. */
  email: string | null;
  /** Stable subject bound to that Users row by login_first_bind. */
  providerSubject: string;
  verify(username: string, password: string): Promise<boolean>;
}

export interface RouteDependencies {
  clock: { now(): Date };
  requestId: { generate(): string };
  randomToken: (length?: number) => string;
  crypto: CryptoAdapter;
  adminLogin: AdminLogin;
  rateLimiter: RateLimiter;
  appsScript: AppsScriptAuthClient;
  /** MVP-2A: the internal-CRUD sibling client, reused across all CRUD routes. */
  appsScriptCrud: AppsScriptCrudClient;
  rateLimitKeySecret: string;
  sessionIdleSeconds: number;
  sessionAbsoluteSeconds: number;
  appOrigin: string;
}
