import { failure, success, failureForOperationalError } from "./response";
import { createRequestContext } from "./runtime";
import type { ApiResponse, Clock, ErrorCode, UuidGenerator } from "./contracts";
import { AuthDenied } from "./auth-domain";
import { EnvelopeError } from "./auth-envelope";
import { ConfigurationError } from "./config";

/** The only HTTP-reachable internal-auth operations. Not a dynamic lookup. */
export type IngressOperation =
  "login_first_bind" | "validate_session" | "issue_csrf" | "logout";

const ALLOWED_OPERATIONS: readonly IngressOperation[] = [
  "login_first_bind",
  "validate_session",
  "issue_csrf",
  "logout",
];

function isAllowedOperation(value: unknown): value is IngressOperation {
  return (
    typeof value === "string" &&
    (ALLOWED_OPERATIONS as readonly string[]).includes(value)
  );
}

/** Mirrors the subset of an Apps Script postData object this ingress needs. */
export interface IngressPostData {
  type?: string;
  contents?: string;
}

export interface IngressEvent {
  pathInfo?: string;
  postData?: IngressPostData;
}

export interface IngressDependencies {
  clock: Clock;
  uuidGenerator: UuidGenerator;
  /**
   * Calls the frozen Phase 03B dispatcher unchanged. This ingress performs no
   * signature, session, or domain logic of its own.
   */
  executeInternalAuth(
    operation: IngressOperation,
    envelope: unknown,
  ): { userId?: string; role?: string; sessionId?: string };
}

export const INTERNAL_AUTH_PATH = "/v1/internal/auth";
const MAX_BODY_BYTES = 16 * 1024;

function byteLength(value: string): number {
  // Manual UTF-8 byte counting: Apps Script has no Buffer/TextEncoder
  // guarantee, and JS string .length undercounts multi-byte characters.
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: consumes the following low surrogate as one
      // 4-byte UTF-8 code point.
      index += 1;
      bytes += 4;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function parseMediaType(contentType: string | undefined): string | null {
  if (typeof contentType !== "string" || contentType.trim() === "") return null;
  const [rawType, ...rawParameters] = contentType.split(";");
  const type = rawType.trim().toLowerCase();
  for (const parameter of rawParameters) {
    const [rawKey, rawValue] = parameter.split("=");
    const key = (rawKey ?? "").trim().toLowerCase();
    const value = (rawValue ?? "").trim().toLowerCase();
    if (key === "charset" && value !== "" && value !== "utf-8") return null;
  }
  return type;
}

function classify(error: unknown): ErrorCode {
  if (error instanceof AuthDenied || error instanceof EnvelopeError)
    return "AUTH_DENIED";
  if (error instanceof ConfigurationError) return "INTERNAL_ERROR";
  const mapped = failureForOperationalError("", error);
  return mapped.error.code === "CONFLICT" ? "CONFLICT" : "INTERNAL_ERROR";
}

/**
 * Strict internal-auth ingress: validates path, postData, media type, UTF-8
 * body size, JSON shape, outer keys, and the operation allowlist before ever
 * touching the frozen Phase 03B envelope verifier/dispatcher. Never logs the
 * body, envelope, or any raw error.
 */
export function handleInternalAuthRequest(
  event: IngressEvent,
  dependencies: IngressDependencies,
): ApiResponse<{ userId?: string; role?: string; sessionId?: string }> {
  const context = createRequestContext(
    dependencies.clock,
    dependencies.uuidGenerator,
  );
  try {
    if (event.postData === undefined || event.postData === null)
      return failure(context.requestId, "VALIDATION_ERROR");

    if (parseMediaType(event.postData.type) !== "application/json")
      return failure(context.requestId, "VALIDATION_ERROR");

    const contents = event.postData.contents;
    if (typeof contents !== "string")
      return failure(context.requestId, "VALIDATION_ERROR");
    if (byteLength(contents) > MAX_BODY_BYTES)
      return failure(context.requestId, "VALIDATION_ERROR");

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      return failure(context.requestId, "VALIDATION_ERROR");
    }

    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")
      return failure(context.requestId, "VALIDATION_ERROR");
    const outer = parsed as Record<string, unknown>;
    const outerKeys = Object.keys(outer);
    if (
      outerKeys.length !== 2 ||
      !outerKeys.includes("operation") ||
      !outerKeys.includes("envelope")
    )
      return failure(context.requestId, "VALIDATION_ERROR");

    if (!isAllowedOperation(outer.operation))
      return failure(context.requestId, "AUTH_DENIED");
    if (
      outer.envelope === null ||
      Array.isArray(outer.envelope) ||
      typeof outer.envelope !== "object"
    )
      return failure(context.requestId, "VALIDATION_ERROR");

    const result = dependencies.executeInternalAuth(
      outer.operation,
      outer.envelope,
    );
    return success(context.requestId, result, dependencies.clock);
  } catch (error) {
    return failure(context.requestId, classify(error));
  }
}
