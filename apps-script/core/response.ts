import type {
  ApiFailure,
  ApiResponse,
  ApiSuccess,
  Clock,
  ErrorCode,
  ValidationDetail,
} from "./contracts";
import { toUtcIso } from "./runtime";
import { LockConflictError } from "./lock";
import { StaleVersionError } from "./versioning";

const SAFE_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Request validation failed.",
  UNAUTHENTICATED: "Authentication is required.",
  FORBIDDEN: "You are not permitted to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  CONFLICT: "The request could not be completed due to a conflict.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  INTERNAL_ERROR: "An internal server error occurred.",
};

export function success<T>(
  requestId: string,
  data: T,
  clock: Clock,
  nextCursor: string | null = null,
): ApiSuccess<T> {
  return {
    ok: true,
    requestId,
    data,
    meta: { timestamp: toUtcIso(clock.now()), nextCursor },
  };
}

export function failure(
  requestId: string,
  code: ErrorCode,
  details: readonly ValidationDetail[] = [],
): ApiFailure {
  return {
    ok: false,
    requestId,
    error: { code, message: SAFE_MESSAGES[code], details },
  };
}

/** Future mutation routes use this mapping without exposing operational errors. */
export function failureForOperationalError(
  requestId: string,
  error: unknown,
): ApiFailure {
  if (
    error instanceof LockConflictError ||
    error instanceof StaleVersionError
  ) {
    return failure(requestId, "CONFLICT");
  }
  return failure(requestId, "INTERNAL_ERROR");
}

export function serialize(response: ApiResponse<unknown>): string {
  return JSON.stringify(response);
}
