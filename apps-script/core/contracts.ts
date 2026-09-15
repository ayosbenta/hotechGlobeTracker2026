export const API_VERSION = "v1";

export const STATUS_VALUES = [
  "Pending",
  "Transmitted",
  "With Job Order",
  "Ongoing",
  "Installed",
  "Delayed",
  "Cancelled/Rejected",
] as const;

export type ApplicationStatus = (typeof STATUS_VALUES)[number];

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  // Reserved for the Phase 03C1A internal-auth ingress only: signals that the
  // frozen Phase 03B envelope/session verification denied the request.
  | "AUTH_DENIED";

export interface Clock {
  now(): Date;
}

export interface UuidGenerator {
  generate(): string;
}

export interface RequestContext {
  requestId: string;
  receivedAt: string;
}

export interface ApiMeta {
  timestamp: string;
  nextCursor: string | null;
}

export interface ApiSuccess<T> {
  ok: true;
  requestId: string;
  data: T;
  meta: ApiMeta;
}

export interface ApiFailure {
  ok: false;
  requestId: string;
  error: {
    code: ErrorCode;
    message: string;
    details: readonly ValidationDetail[];
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface ValidationDetail {
  field: string;
  issue: string;
}

/**
 * Reserved for a later authenticated phase. The API entrypoints in Phase 02
 * never construct this from request data and do not trust client claims.
 */
export interface AuthenticatedActor {
  userId: string;
  role: "Admin" | "Agent" | "Processor";
  email: string;
}

export interface ApplicationVersionSnapshot {
  applicationId: string;
  version: number;
}
