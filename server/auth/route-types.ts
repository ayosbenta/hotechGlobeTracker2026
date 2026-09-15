import type { AppsScriptAuthClient } from "./apps-script-client";
import type { CryptoAdapter } from "./crypto";
import type {
  GoogleIdTokenVerifier,
  VerifiedGoogleIdentity,
} from "./google-verifier";
import type { NonceStore } from "./nonce-store";
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

export interface RouteDependencies {
  clock: { now(): Date };
  requestId: { generate(): string };
  randomToken: (length?: number) => string;
  crypto: CryptoAdapter;
  googleVerifier: GoogleIdTokenVerifier;
  nonceStore: NonceStore;
  rateLimiter: RateLimiter;
  appsScript: AppsScriptAuthClient;
  rateLimitKeySecret: string;
  sessionIdleSeconds: number;
  sessionAbsoluteSeconds: number;
  appOrigin: string;
  isPermittedGoogleAccountDomain: (identity: VerifiedGoogleIdentity) => boolean;
}
