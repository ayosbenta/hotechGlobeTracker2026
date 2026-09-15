import type { CryptoAdapter } from "../auth/crypto";
import { createInternalEnvelope, type SigningKey } from "../auth/signing";

export type CrudOperation = "plans_list" | "plans_create" | "plans_update";

const OPERATION_PATHS: Record<CrudOperation, { method: "POST"; path: string }> =
  {
    plans_list: { method: "POST", path: "/internal/v1/crud/plans/list" },
    plans_create: { method: "POST", path: "/internal/v1/crud/plans/create" },
    plans_update: { method: "POST", path: "/internal/v1/crud/plans/update" },
  };

export interface AppsScriptCrudResult {
  data: unknown;
  nextCursor: string | null;
}

export class AppsScriptUnavailableError extends Error {
  constructor() {
    super("Apps Script CRUD service is unavailable.");
    this.name = "AppsScriptUnavailableError";
  }
}

export class AppsScriptDeniedError extends Error {
  constructor(
    readonly scriptCode:
      | "AUTH_DENIED"
      | "VALIDATION_ERROR"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT",
  ) {
    super("Apps Script denied the CRUD request.");
    this.name = "AppsScriptDeniedError";
  }
}

export interface AppsScriptCrudClient {
  execute(
    operation: CrudOperation,
    payload: Record<string, unknown>,
  ): Promise<AppsScriptCrudResult>;
}

export interface AppsScriptCrudClientConfig {
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

type ScriptErrorCode =
  | "AUTH_DENIED"
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const RECOGNIZED_CODES: readonly ScriptErrorCode[] = [
  "AUTH_DENIED",
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
];

function scriptErrorCode(
  body: Record<string, unknown>,
): ScriptErrorCode | null {
  const error = body.error;
  if (error === null || typeof error !== "object") return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" &&
    (RECOGNIZED_CODES as readonly string[]).includes(code)
    ? (code as ScriptErrorCode)
    : null;
}

/**
 * Signs every request with the same frozen canonical envelope Phase 03C1A's
 * auth client uses and posts it to the Apps Script internal CRUD endpoint.
 * Never logs the envelope, secret, signature, or response body. This is a
 * new client for the new CRUD ingress — the auth client (apps-script-client.ts)
 * is unchanged.
 */
export function createAppsScriptCrudClient(
  config: AppsScriptCrudClientConfig,
  crypto: CryptoAdapter,
  clock: { now(): Date },
  fetcher: Fetcher = fetch,
): AppsScriptCrudClient {
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
        throw new AppsScriptUnavailableError();
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        if (
          response.status >= 500 ||
          response.status === 429 ||
          response.status === 408
        )
          throw new AppsScriptUnavailableError();
        throw new AppsScriptDeniedError("AUTH_DENIED");
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
        const meta = record.meta as Record<string, unknown> | undefined;
        return {
          data: record.data,
          nextCursor:
            meta !== undefined && typeof meta.nextCursor === "string"
              ? meta.nextCursor
              : null,
        };
      }
      const code = scriptErrorCode(record);
      if (
        code === "AUTH_DENIED" ||
        code === "VALIDATION_ERROR" ||
        code === "FORBIDDEN" ||
        code === "NOT_FOUND" ||
        code === "CONFLICT"
      )
        throw new AppsScriptDeniedError(code);
      throw new AppsScriptUnavailableError();
    },
  };
}
