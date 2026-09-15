export type BffErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "ACCOUNT_INACTIVE"
  | "ACCOUNT_LOCKED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "REPLAY_OR_CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "AUTH_SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface BffSuccess<T> {
  ok: true;
  requestId: string;
  data: T;
}

export interface BffFailure {
  ok: false;
  requestId: string;
  error: { code: BffErrorCode; message: string };
}

export type BffResponse<T> = BffSuccess<T> | BffFailure;

const SAFE_MESSAGES: Record<BffErrorCode, string> = {
  VALIDATION_ERROR: "The request could not be processed.",
  AUTH_REQUIRED: "Sign in is required.",
  SESSION_EXPIRED: "Your session has expired. Please sign in again.",
  ACCOUNT_INACTIVE: "This account is inactive. Please contact the Admin.",
  ACCOUNT_LOCKED: "This account is locked. Please contact the Admin.",
  FORBIDDEN: "You are not permitted to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  REPLAY_OR_CONFLICT: "The request could not be completed. Please try again.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  UPSTREAM_UNAVAILABLE: "The service is temporarily unavailable.",
  AUTH_SERVICE_UNAVAILABLE: "Authentication is temporarily unavailable.",
  INTERNAL_ERROR: "An internal server error occurred.",
};

export const BFF_STATUS_BY_CODE: Record<BffErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  SESSION_EXPIRED: 401,
  ACCOUNT_INACTIVE: 403,
  ACCOUNT_LOCKED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REPLAY_OR_CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 502,
  AUTH_SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export function bffSuccess<T>(requestId: string, data: T): BffSuccess<T> {
  return { ok: true, requestId, data };
}

export function bffFailure(requestId: string, code: BffErrorCode): BffFailure {
  return {
    ok: false,
    requestId,
    error: { code, message: SAFE_MESSAGES[code] },
  };
}

export class BffError extends Error {
  readonly code: BffErrorCode;
  constructor(code: BffErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = "BffError";
    this.code = code;
  }
}
