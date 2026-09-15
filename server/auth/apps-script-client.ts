import type { CryptoAdapter } from "./crypto";
import { createInternalEnvelope, type SigningKey } from "./signing";

export type InternalOperation =
  | "login_first_bind"
  | "validate_session"
  | "rotate_session"
  | "issue_csrf"
  | "logout"
  | "revoke_session";

const OPERATION_PATHS: Record<
  InternalOperation,
  { method: "POST"; path: string }
> = {
  login_first_bind: {
    method: "POST",
    path: "/internal/v1/auth/login-first-bind",
  },
  validate_session: {
    method: "POST",
    path: "/internal/v1/auth/session/validate",
  },
  rotate_session: { method: "POST", path: "/internal/v1/auth/session/rotate" },
  issue_csrf: { method: "POST", path: "/internal/v1/auth/csrf/issue" },
  logout: { method: "POST", path: "/internal/v1/auth/logout" },
  revoke_session: { method: "POST", path: "/internal/v1/auth/session/revoke" },
};

export interface AppsScriptAuthResult {
  userId?: string;
  role?: string;
  sessionId?: string;
}

export class AppsScriptUnavailableError extends Error {
  constructor() {
    super("Apps Script authentication service is unavailable.");
    this.name = "AppsScriptUnavailableError";
  }
}

export class AppsScriptDeniedError extends Error {
  constructor() {
    super("Apps Script denied the authentication request.");
    this.name = "AppsScriptDeniedError";
  }
}

export interface AppsScriptAuthClient {
  execute(
    operation: InternalOperation,
    payload: Record<string, unknown>,
  ): Promise<AppsScriptAuthResult>;
}

export interface AppsScriptClientConfig {
  internalUrl: string;
  audience: string;
  signingKey: SigningKey;
}

interface Fetcher {
  (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

/**
 * Signs every request with the frozen Phase 03B canonical envelope and posts
 * it to the Apps Script internal endpoint. Never logs the envelope, secret,
 * signature, or response body.
 */
export function createAppsScriptAuthClient(
  config: AppsScriptClientConfig,
  crypto: CryptoAdapter,
  clock: { now(): Date },
  fetcher: Fetcher = fetch,
): AppsScriptAuthClient {
  return {
    async execute(operation, payload) {
      const contract = OPERATION_PATHS[operation];
      const envelope = createInternalEnvelope(
        crypto,
        clock.now(),
        config.signingKey,
        {
          audience: config.audience,
          method: contract.method,
          path: contract.path,
          payload,
        },
      );
      let response;
      try {
        response = await fetcher(config.internalUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operation, envelope }),
        });
      } catch {
        throw new AppsScriptUnavailableError();
      }
      if (!response.ok) {
        // 5xx, 429 (quota), and 408 (timeout) are retryable upstream
        // conditions, not an authoritative denial of the request.
        if (
          response.status >= 500 ||
          response.status === 429 ||
          response.status === 408
        )
          throw new AppsScriptUnavailableError();
        throw new AppsScriptDeniedError();
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new AppsScriptUnavailableError();
      }
      if (
        body === null ||
        typeof body !== "object" ||
        (body as Record<string, unknown>).ok !== true ||
        typeof (body as Record<string, unknown>).data !== "object"
      )
        throw new AppsScriptDeniedError();
      return (body as { data: AppsScriptAuthResult }).data;
    },
  };
}
