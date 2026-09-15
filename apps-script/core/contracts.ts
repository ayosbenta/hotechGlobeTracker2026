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

/**
 * The only HTTP-reachable CRUD operations for MVP-2A/2B/2C. An explicit
 * allowlist, mirroring auth-domain.ts's Operation union — never a
 * dynamic/caller-keyed dispatch. Extended (not replaced) as later MVP-2
 * batches add entities.
 */
export type CrudOperation =
  | "plans_list"
  | "plans_create"
  | "plans_update"
  | "users_list"
  | "users_update"
  | "applications_list"
  | "applications_get"
  | "applications_create"
  | "applications_update"
  | "applications_assign";

export type PlanStatus = "Active" | "Inactive";

/**
 * The frozen Phase 02 `Plans` schema has no dedicated `version` column (see
 * apps-script/core/schema.ts). Optimistic concurrency for Plans therefore
 * uses `updatedAt` as the client-supplied concurrency token instead of the
 * `assertCurrentVersion` numeric-version helper, which remains reserved for
 * `Applications.version` per the frozen schema.
 */
export interface PlanRecord {
  planId: string;
  planName: string;
  monthlyPrice: number;
  speedMbps: number;
  planStatus: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "Admin" | "Agent" | "Processor";
export type UserAccountStatus = "Active" | "Inactive" | "Locked";

/**
 * The frozen Phase 02/03A `Users` schema (see apps-script/core/schema.ts) has
 * no `version` column. MVP-2B follows the same `updatedAt`-token optimistic
 * concurrency pattern D-041 established for Plans, keyed on `updatedAt`
 * instead of `assertCurrentVersion`.
 */
export interface UserRecord {
  userId: string;
  email: string;
  fullName: string;
  mobileNumber: string;
  role: UserRole;
  accountStatus: UserAccountStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * The frozen Phase 02 `Applications` schema (apps-script/core/schema.ts,
 * 22 columns). Applications DO have a `version` column, so mutations use
 * `versioning.ts`'s frozen `assertCurrentVersion` unchanged — never the
 * `updatedAt`-token pattern reserved for version-less entities (Plans,
 * Users).
 */
export interface ApplicationRecord {
  applicationId: string;
  customerFullName: string;
  mobileNumber: string;
  email: string;
  completeAddress: string;
  barangay: string;
  cityMunicipality: string;
  province: string;
  landmark: string;
  planId: string;
  planNameSnapshot: string;
  monthlyPriceSnapshot: number;
  agentId: string;
  processorId: string;
  currentStatus: ApplicationStatus;
  jobOrderNumber: string;
  submittedAt: string;
  installedAt: string;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
