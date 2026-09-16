import type { CryptoAdapter } from "./crypto.js";
import { createInternalEnvelope, type SigningKey } from "./signing.js";

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
    init: {
      method: string;
      headers: Record<string, string>;
      body: string;
      signal?: AbortSignal;
    },
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

const REQUEST_TIMEOUT_MS = 12_000;

type ScriptErrorCode = "AUTH_DENIED" | "CONFLICT" | "INTERNAL_ERROR";

function scriptErrorCode(
  body: Record<string, unknown>,
): ScriptErrorCode | null {
  const error = body.error;
  if (error === null || typeof error !== "object") return null;
  const code = (error as Record<string, unknown>).code;
  return code === "AUTH_DENIED" ||
    code === "CONFLICT" ||
    code === "INTERNAL_ERROR"
    ? code
    : null;
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetcher(config.internalUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operation, envelope }),
          signal: controller.signal,
        });
      } catch {
        // Covers network failure and the 12-second abort timeout alike; no
        // automatic retry is attempted for any auth/session mutation.
        throw new AppsScriptUnavailableError();
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        // 5xx, 429 (quota), and 408 (timeout) are retryable Google-edge
        // conditions, never a script-authored denial.
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
      if (body === null || typeof body !== "object")
        throw new AppsScriptUnavailableError();
      const record = body as Record<string, unknown>;
      if (record.ok === true) {
        if (typeof record.data !== "object" || record.data === null)
          throw new AppsScriptUnavailableError();
        return record.data as AppsScriptAuthResult;
      }
      // Apps Script always answers HTTP 200; the JSON envelope's own error
      // code, not the HTTP status, is authoritative for the outcome.
      const code = scriptErrorCode(record);
      if (code === "AUTH_DENIED") throw new AppsScriptDeniedError();
      if (code === "CONFLICT" || code === "INTERNAL_ERROR")
        throw new AppsScriptUnavailableError();
      throw new AppsScriptUnavailableError();
    },
  };
}
