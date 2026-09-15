import type { AuthConfig } from "./auth-config";
import type { AuthDomainDependencies } from "./auth-domain";
import {
  AuthDenied,
  requireSessionCsrf,
  resolveAuthenticatedActor,
} from "./auth-domain";
import { verifyEnvelope, type InternalEnvelope } from "./auth-envelope";
import type { CryptoAdapter } from "./auth-crypto";
import type {
  Clock,
  CrudOperation,
  PlanRecord,
  PlanStatus,
  UserAccountStatus,
  UserRole,
  UuidGenerator,
} from "./contracts";
import {
  isPlanStatus,
  type PlanRecordWithRow,
  type PlansRepository,
} from "./plans-repository";
import {
  isUserAccountStatus,
  isUserRole,
  type UserRecordWithRow,
  type UsersRepository,
} from "./users-repository";
import { withScriptLock, type LockServiceAdapter } from "./lock";
import { appendActivityLog } from "./audit";
import type { SpreadsheetSheet } from "./schema";

export class CrudValidationError extends Error {
  constructor(message = "Request validation failed.") {
    super(message);
    this.name = "CrudValidationError";
  }
}
export class CrudForbiddenError extends Error {
  constructor() {
    super("You are not permitted to perform this action.");
    this.name = "CrudForbiddenError";
  }
}
export class CrudNotFoundError extends Error {
  constructor() {
    super("The requested resource was not found.");
    this.name = "CrudNotFoundError";
  }
}
export class CrudConflictError extends Error {
  constructor() {
    super("The request could not be completed due to a conflict.");
    this.name = "CrudConflictError";
  }
}

/**
 * MVP-2B: rejecting a last-active-Admin demotion/deactivation with
 * VALIDATION_ERROR (not FORBIDDEN) — the acting Admin IS authorized to edit
 * Users; the request is simply invalid because it would leave the system
 * with zero active Admins. FORBIDDEN is reserved for "you may not perform
 * this kind of action at all" (wrong role / not your own row).
 */
export class CrudLastAdminError extends CrudValidationError {
  constructor() {
    super("This action would leave no active Admin account.");
    this.name = "CrudLastAdminError";
  }
}

const OPERATION_CONTRACTS: Record<
  CrudOperation,
  { method: string; path: string }
> = {
  plans_list: { method: "POST", path: "/internal/v1/crud/plans/list" },
  plans_create: { method: "POST", path: "/internal/v1/crud/plans/create" },
  plans_update: { method: "POST", path: "/internal/v1/crud/plans/update" },
  users_list: { method: "POST", path: "/internal/v1/crud/users/list" },
  users_update: { method: "POST", path: "/internal/v1/crud/users/update" },
};

export interface CrudAuthDependencies {
  config: AuthConfig;
  crypto: CryptoAdapter;
  clock: Clock;
  ids: UuidGenerator;
  authStore: AuthDomainDependencies["store"];
}

export interface CrudLock {
  run<T>(work: () => T): T;
}

export interface CrudDependencies extends CrudAuthDependencies {
  lock: CrudLock;
  plansRepository: PlansRepository;
  usersRepository: UsersRepository;
  activityLogSheet: SpreadsheetSheet;
}

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 25;

function toAuthDeps(deps: CrudDependencies): AuthDomainDependencies {
  return {
    config: deps.config,
    crypto: deps.crypto,
    clock: deps.clock,
    ids: deps.ids,
    store: deps.authStore,
    lock: { run: (work) => work() },
  };
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maxLength
  )
    throw new CrudValidationError(`Invalid value for ${field}.`);
  return value.trim();
}

function requiredPositiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new CrudValidationError(`Invalid value for ${field}.`);
  return value;
}

function requiredPlanStatus(value: unknown): PlanStatus {
  if (!isPlanStatus(value))
    throw new CrudValidationError("Invalid plan_status.");
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maxLength
  )
    throw new CrudValidationError(`Invalid value for ${field}.`);
  return value.trim();
}

const MOBILE_NUMBER_PATTERN = /^[0-9+()\-.\s]{7,20}$/;

function requiredMobileNumber(value: unknown): string {
  const candidate = optionalString(value, "mobile_number", 20);
  if (!MOBILE_NUMBER_PATTERN.test(candidate))
    throw new CrudValidationError("Invalid value for mobile_number.");
  return candidate;
}

function requiredUserRole(value: unknown): UserRole {
  if (!isUserRole(value)) throw new CrudValidationError("Invalid role.");
  return value;
}

function requiredUserAccountStatus(value: unknown): UserAccountStatus {
  if (!isUserAccountStatus(value))
    throw new CrudValidationError("Invalid account_status.");
  return value;
}

function paginate<T>(
  items: readonly T[],
  cursor: unknown,
  limit: unknown,
): { page: T[]; nextCursor: string | null } {
  const start =
    typeof cursor === "string" && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const size =
    typeof limit === "number" &&
    Number.isInteger(limit) &&
    limit > 0 &&
    limit <= MAX_PAGE_SIZE
      ? limit
      : DEFAULT_PAGE_SIZE;
  const page = items.slice(start, start + size);
  const nextCursor = start + size < items.length ? String(start + size) : null;
  return { page, nextCursor };
}

export interface CrudResult {
  data: unknown;
  nextCursor: string | null;
}

/**
 * Internal-only CRUD dispatcher, mirroring executeInternalAuth's shape:
 * verifies the signed envelope, requires a valid session for every
 * operation, derives the authoritative actor from that session (never a
 * client claim), and performs the requested Plans operation under the
 * frozen script lock with an audit row. Not called by doGet/doPost directly
 * — only through the crud-ingress allowlist.
 */
export function executeCrud(
  operation: CrudOperation,
  raw: unknown,
  deps: CrudDependencies,
): CrudResult {
  const contract = OPERATION_CONTRACTS[operation];
  const verified = verifyEnvelope(
    raw,
    contract,
    deps.config,
    deps.clock,
    deps.crypto,
  );
  return deps.lock.run(() => {
    const authDeps = toAuthDeps(deps);
    const payload = verified.envelope.payload;
    const sessionToken = requiredSessionToken(payload);
    const actor = resolveAuthenticatedActor(authDeps, sessionToken);

    if (operation === "plans_list") {
      return listPlans(actor.role, payload, deps);
    }
    if (operation === "users_list") {
      return listUsers(actor.role, payload, deps);
    }

    // Every mutation additionally requires CSRF double-submit.
    requireSessionCsrf(authDeps, sessionToken, payload.csrf_token);

    if (operation === "plans_create") {
      return createPlan(actor, payload, deps, verified.envelope);
    }
    if (operation === "plans_update") {
      return updatePlan(actor, payload, deps, verified.envelope);
    }
    if (operation === "users_update") {
      return updateUser(actor, payload, deps, verified.envelope);
    }
    throw new CrudValidationError();
  });
}

function requiredSessionToken(payload: Record<string, unknown>): string {
  if (typeof payload.session_token !== "string" || payload.session_token === "")
    throw new AuthDenied();
  return payload.session_token;
}

function listPlans(
  role: "Admin" | "Agent" | "Processor",
  payload: Record<string, unknown>,
  deps: CrudDependencies,
): CrudResult {
  const all = deps.plansRepository.list();
  const scoped =
    role === "Admin" ? all : all.filter((p) => p.planStatus === "Active");
  const { page, nextCursor } = paginate(scoped, payload.cursor, payload.limit);
  return { data: page, nextCursor };
}

function createPlan(
  actor: { userId: string; role: "Admin" | "Agent" | "Processor" },
  payload: Record<string, unknown>,
  deps: CrudDependencies,
  envelope: InternalEnvelope,
): CrudResult {
  if (actor.role !== "Admin") throw new CrudForbiddenError();
  const planName = requiredString(payload.plan_name, "plan_name", 120);
  const monthlyPrice = requiredPositiveNumber(
    payload.monthly_price,
    "monthly_price",
  );
  const speedMbps = requiredPositiveNumber(payload.speed_mbps, "speed_mbps");
  const planStatus = requiredPlanStatus(payload.plan_status ?? "Active");
  const now = deps.clock.now().toISOString();
  const planId = deps.ids.generate();
  const record: PlanRecord = {
    planId,
    planName,
    monthlyPrice,
    speedMbps,
    planStatus,
    createdAt: now,
    updatedAt: now,
  };
  deps.plansRepository.create(record);
  appendActivityLog(
    deps.activityLogSheet,
    {
      actorUserId: actor.userId,
      action: "PLAN_CREATE",
      entityType: "Plan",
      entityId: planId,
      requestId: envelope.jti,
      metadata: { planName, planStatus },
    },
    deps.clock,
    deps.ids,
  );
  return { data: record, nextCursor: null };
}

function updatePlan(
  actor: { userId: string; role: "Admin" | "Agent" | "Processor" },
  payload: Record<string, unknown>,
  deps: CrudDependencies,
  envelope: InternalEnvelope,
): CrudResult {
  if (actor.role !== "Admin") throw new CrudForbiddenError();
  const planId = requiredString(payload.plan_id, "plan_id", 200);
  const expectedUpdatedAt = requiredString(
    payload.expected_updated_at,
    "expected_updated_at",
    64,
  );
  const existing = deps.plansRepository.findById(planId);
  if (existing === null) throw new CrudNotFoundError();
  if (existing.updatedAt !== expectedUpdatedAt) throw new CrudConflictError();

  const changes: {
    planName?: string;
    monthlyPrice?: number;
    speedMbps?: number;
    planStatus?: PlanStatus;
    updatedAt: string;
  } = { updatedAt: deps.clock.now().toISOString() };
  if (payload.plan_name !== undefined)
    changes.planName = requiredString(payload.plan_name, "plan_name", 120);
  if (payload.monthly_price !== undefined)
    changes.monthlyPrice = requiredPositiveNumber(
      payload.monthly_price,
      "monthly_price",
    );
  if (payload.speed_mbps !== undefined)
    changes.speedMbps = requiredPositiveNumber(
      payload.speed_mbps,
      "speed_mbps",
    );
  if (payload.plan_status !== undefined)
    changes.planStatus = requiredPlanStatus(payload.plan_status);

  const updated = deps.plansRepository.update(
    existing as PlanRecordWithRow,
    changes,
  );
  appendActivityLog(
    deps.activityLogSheet,
    {
      actorUserId: actor.userId,
      action: "PLAN_UPDATE",
      entityType: "Plan",
      entityId: planId,
      requestId: envelope.jti,
      metadata: {
        changedFields: Object.keys(changes).filter((k) => k !== "updatedAt"),
      },
    },
    deps.clock,
    deps.ids,
  );
  return { data: updated, nextCursor: null };
}

function listUsers(
  role: "Admin" | "Agent" | "Processor",
  payload: Record<string, unknown>,
  deps: CrudDependencies,
): CrudResult {
  if (role !== "Admin") throw new CrudForbiddenError();
  const filter: { role?: UserRole; accountStatus?: UserAccountStatus } = {};
  if (payload.role !== undefined) filter.role = requiredUserRole(payload.role);
  if (payload.account_status !== undefined)
    filter.accountStatus = requiredUserAccountStatus(payload.account_status);
  const all = deps.usersRepository.list(filter);
  const { page, nextCursor } = paginate(all, payload.cursor, payload.limit);
  return { data: page, nextCursor };
}

/**
 * PATCH /api/users/:userId domain behavior. Admins may change any user's
 * role/account_status/profile fields; any authenticated user (any role) may
 * update only their OWN full_name/mobile_number through this same operation.
 * An Admin may never change their own role away from Admin, and no change
 * (role-away-from-Admin or account_status-to-inactive/locked on an Admin
 * row) may reduce the count of remaining active Admins to zero.
 */
function updateUser(
  actor: { userId: string; role: "Admin" | "Agent" | "Processor" },
  payload: Record<string, unknown>,
  deps: CrudDependencies,
  envelope: InternalEnvelope,
): CrudResult {
  const userId = requiredString(payload.user_id, "user_id", 200);
  const expectedUpdatedAt = requiredString(
    payload.expected_updated_at,
    "expected_updated_at",
    64,
  );
  const existing = deps.usersRepository.findById(userId);
  if (existing === null) throw new CrudNotFoundError();
  if (existing.updatedAt !== expectedUpdatedAt) throw new CrudConflictError();

  const isSelf = actor.userId === userId;
  const wantsRoleChange = payload.role !== undefined;
  const wantsAccountStatusChange = payload.account_status !== undefined;

  if (actor.role !== "Admin") {
    // Non-admins may only ever update their own profile fields.
    if (!isSelf || wantsRoleChange || wantsAccountStatusChange)
      throw new CrudForbiddenError();
  } else if (!isSelf) {
    // Admin acting on another user: full write access to the allowed fields.
  } else {
    // Admin acting on their own row: profile changes are fine, but an Admin
    // may never move their OWN role away from Admin through this route
    // (unsafe self-role-escalation-away prevention).
    if (wantsRoleChange && requiredUserRole(payload.role) !== "Admin")
      throw new CrudForbiddenError();
  }

  const nextRole = wantsRoleChange
    ? requiredUserRole(payload.role)
    : existing.role;
  const nextAccountStatus = wantsAccountStatusChange
    ? requiredUserAccountStatus(payload.account_status)
    : existing.accountStatus;

  // Prevent removing the last active Admin: if this row is currently an
  // active Admin and the requested change would make it stop counting as
  // one, ensure at least one OTHER active Admin remains.
  const losingAdminEligibility =
    existing.role === "Admin" &&
    existing.accountStatus === "Active" &&
    (nextRole !== "Admin" ||
      (nextAccountStatus !== "Active" && wantsAccountStatusChange));
  if (losingAdminEligibility) {
    const remaining = deps.usersRepository.countActiveAdmins(userId);
    if (remaining === 0) throw new CrudLastAdminError();
  }

  const changes: {
    fullName?: string;
    mobileNumber?: string;
    role?: UserRole;
    accountStatus?: UserAccountStatus;
    updatedAt: string;
  } = { updatedAt: deps.clock.now().toISOString() };
  if (payload.full_name !== undefined)
    changes.fullName = optionalString(payload.full_name, "full_name", 200);
  if (payload.mobile_number !== undefined)
    changes.mobileNumber = requiredMobileNumber(payload.mobile_number);
  if (wantsRoleChange) changes.role = nextRole;
  if (wantsAccountStatusChange) changes.accountStatus = nextAccountStatus;

  const updated = deps.usersRepository.update(
    existing as UserRecordWithRow,
    changes,
  );
  appendActivityLog(
    deps.activityLogSheet,
    {
      actorUserId: actor.userId,
      action: "USER_UPDATE",
      entityType: "User",
      entityId: userId,
      requestId: envelope.jti,
      metadata: {
        changedFields: Object.keys(changes).filter((k) => k !== "updatedAt"),
        self: isSelf,
      },
    },
    deps.clock,
    deps.ids,
  );
  return { data: updated, nextCursor: null };
}

/** Re-exported for the CRUD ingress module's lock-conflict classification. */
export type { LockServiceAdapter };
export { withScriptLock };
