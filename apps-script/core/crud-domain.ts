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
  ApplicationRecord,
  Clock,
  CrudOperation,
  PlanRecord,
  PlanStatus,
  UserAccountStatus,
  UserRole,
  UuidGenerator,
} from "./contracts";
import {
  isApplicationStatus,
  stripApplicationRow,
  type ApplicationRecordWithRow,
  type ApplicationsRepository,
  type UpdateApplicationChanges,
} from "./applications-repository";
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
import { validateTransition } from "./status-transitions";
import { assertCurrentVersion, StaleVersionError } from "./versioning";
import type { SpreadsheetSheet } from "./schema";
import { buildDashboardAggregate } from "./dashboard-aggregate";

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
  applications_list: {
    method: "POST",
    path: "/internal/v1/crud/applications/list",
  },
  applications_get: {
    method: "POST",
    path: "/internal/v1/crud/applications/get",
  },
  applications_create: {
    method: "POST",
    path: "/internal/v1/crud/applications/create",
  },
  applications_update: {
    method: "POST",
    path: "/internal/v1/crud/applications/update",
  },
  applications_assign: {
    method: "POST",
    path: "/internal/v1/crud/applications/assign",
  },
  applications_aggregate: {
    method: "POST",
    path: "/internal/v1/crud/applications/aggregate",
  },
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
  applicationsRepository: ApplicationsRepository;
  activityLogSheet: SpreadsheetSheet;
  statusHistorySheet: SpreadsheetSheet;
}

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 25;

type Actor = { userId: string; role: "Admin" | "Agent" | "Processor" };

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

function optionalTrimmedString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.length > maxLength)
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
 * client claim), and performs the requested operation under the frozen
 * script lock with an audit row. Not called by doGet/doPost directly —
 * only through the crud-ingress allowlist.
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
    if (operation === "applications_list") {
      return listApplications(actor, payload, deps);
    }
    if (operation === "applications_get") {
      return getApplication(actor, payload, deps);
    }
    if (operation === "applications_aggregate") {
      return getApplicationsAggregate(actor, deps);
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
    if (operation === "applications_create") {
      return createApplication(actor, payload, deps, verified.envelope);
    }
    if (operation === "applications_update") {
      return updateApplication(actor, payload, deps, verified.envelope);
    }
    if (operation === "applications_assign") {
      return assignApplication(actor, payload, deps, verified.envelope);
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
  actor: Actor,
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
  actor: Actor,
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
  actor: Actor,
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

// ---------------------------------------------------------------------------
// MVP-2C/2D/2E — Applications
// ---------------------------------------------------------------------------

function appendStatusHistory(
  deps: CrudDependencies,
  input: {
    applicationId: string;
    fromStatus: string;
    toStatus: string;
    notes: string;
    jobOrderNumber: string;
    actorUserId: string;
    requestId: string;
  },
): void {
  deps.statusHistorySheet.appendRow([
    deps.ids.generate(),
    input.applicationId,
    input.fromStatus,
    input.toStatus,
    input.notes,
    input.jobOrderNumber,
    input.actorUserId,
    input.requestId,
    deps.clock.now().toISOString(),
  ]);
}

/** Row-level read authorization: Admin any; Agent own; Processor assigned. */
function mayReadApplication(actor: Actor, record: ApplicationRecord): boolean {
  if (actor.role === "Admin") return true;
  if (actor.role === "Agent") return record.agentId === actor.userId;
  return record.processorId === actor.userId;
}

function listApplications(
  actor: Actor,
  payload: Record<string, unknown>,
  deps: CrudDependencies,
): CrudResult {
  const filter: {
    agentId?: string;
    processorId?: string;
    currentStatus?: ApplicationRecord["currentStatus"];
  } = {};
  if (actor.role === "Admin") {
    if (typeof payload.agent_id === "string") filter.agentId = payload.agent_id;
    if (typeof payload.processor_id === "string")
      filter.processorId = payload.processor_id;
  } else if (actor.role === "Agent") {
    // Never trust a client-supplied agent_id filter as authorization.
    filter.agentId = actor.userId;
  } else {
    filter.processorId = actor.userId;
  }
  if (payload.current_status !== undefined) {
    if (!isApplicationStatus(payload.current_status))
      throw new CrudValidationError("Invalid current_status.");
    filter.currentStatus = payload.current_status;
  }
  const all = deps.applicationsRepository.list(filter);
  const { page, nextCursor } = paginate(all, payload.cursor, payload.limit);
  return { data: page, nextCursor };
}

function getApplication(
  actor: Actor,
  payload: Record<string, unknown>,
  deps: CrudDependencies,
): CrudResult {
  const applicationId = requiredString(
    payload.application_id,
    "application_id",
    200,
  );
  const existing = deps.applicationsRepository.findById(applicationId);
  if (existing === null) throw new CrudNotFoundError();
  // FORBIDDEN is used uniformly for "wrong role" and "not your row" to avoid
  // disclosing whether the row exists to an unauthorized caller.
  if (!mayReadApplication(actor, existing)) throw new CrudForbiddenError();
  return { data: stripApplicationRow(existing), nextCursor: null };
}

/**
 * applications_aggregate — MVP-3 fix (D-047). Supplies both dashboard trend
 * charts (Agent's multi-status trend, Processor's daily productivity chart)
 * with a bounded, role-scoped, zero-filled daily aggregate instead of the
 * illustrative fixtures those charts previously rendered. Role scope is
 * derived only from the authoritative session actor, never a client claim:
 * Admin gets the global aggregate; Agent gets only their own applications;
 * Processor gets only applications assigned to them. No date range or actor
 * identity is ever accepted from the client payload.
 */
function getApplicationsAggregate(
  actor: Actor,
  deps: CrudDependencies,
): CrudResult {
  const scope =
    actor.role === "Admin"
      ? ({ kind: "admin" } as const)
      : actor.role === "Agent"
        ? ({ kind: "agent", agentId: actor.userId } as const)
        : ({ kind: "processor", processorId: actor.userId } as const);
  const all = deps.applicationsRepository.list();
  const result = buildDashboardAggregate(
    scope,
    all,
    deps.statusHistorySheet,
    deps.clock,
  );
  return { data: result, nextCursor: null };
}

function createApplication(
  actor: Actor,
  payload: Record<string, unknown>,
  deps: CrudDependencies,
  envelope: InternalEnvelope,
): CrudResult {
  if (actor.role !== "Admin" && actor.role !== "Agent")
    throw new CrudForbiddenError();

  const customerFullName = requiredString(
    payload.customer_full_name,
    "customer_full_name",
    200,
  );
  const mobileNumber = requiredMobileNumber(payload.mobile_number);
  const email = optionalTrimmedString(payload.email ?? "", "email", 200);
  const completeAddress = requiredString(
    payload.complete_address,
    "complete_address",
    400,
  );
  const barangay = requiredString(payload.barangay, "barangay", 120);
  const cityMunicipality = requiredString(
    payload.city_municipality,
    "city_municipality",
    120,
  );
  const province = requiredString(payload.province, "province", 120);
  const landmark = optionalTrimmedString(
    payload.landmark ?? "",
    "landmark",
    200,
  );
  const planId = requiredString(payload.plan_id, "plan_id", 200);

  const plan = deps.plansRepository.findById(planId);
  if (plan === null || plan.planStatus !== "Active")
    throw new CrudValidationError(
      "plan_id must reference an existing Active plan.",
    );

  // agent_id is NEVER client-trusted: an Agent's own id is always
  // session-derived (MVP-2D). An Admin creating on behalf of someone must
  // supply an explicit agent_id that references an existing Agent-role user
  // (a conservative choice — see D-043).
  let agentId: string;
  if (actor.role === "Agent") {
    agentId = actor.userId;
  } else {
    const requestedAgentId = requiredString(payload.agent_id, "agent_id", 200);
    const agentUser = deps.usersRepository.findById(requestedAgentId);
    if (agentUser === null || agentUser.role !== "Agent")
      throw new CrudValidationError(
        "agent_id must reference an existing Agent user.",
      );
    agentId = requestedAgentId;
  }

  const now = deps.clock.now().toISOString();
  const applicationId = deps.ids.generate();
  const record: ApplicationRecord = {
    applicationId,
    customerFullName,
    mobileNumber,
    email,
    completeAddress,
    barangay,
    cityMunicipality,
    province,
    landmark,
    planId,
    planNameSnapshot: plan.planName,
    monthlyPriceSnapshot: plan.monthlyPrice,
    agentId,
    processorId: "",
    currentStatus: "Pending",
    jobOrderNumber: "",
    submittedAt: now,
    installedAt: "",
    notes:
      typeof payload.notes === "string"
        ? optionalTrimmedString(payload.notes, "notes", 2000)
        : "",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  deps.applicationsRepository.create(record);

  appendActivityLog(
    deps.activityLogSheet,
    {
      actorUserId: actor.userId,
      action: "APPLICATION_CREATE",
      entityType: "Application",
      entityId: applicationId,
      requestId: envelope.jti,
      metadata: { agentId, planId },
    },
    deps.clock,
    deps.ids,
  );
  appendStatusHistory(deps, {
    applicationId,
    fromStatus: "",
    toStatus: "Pending",
    notes: "",
    jobOrderNumber: "",
    actorUserId: actor.userId,
    requestId: envelope.jti,
  });

  return { data: record, nextCursor: null };
}

/** Non-status core fields an Agent may edit on their own Pending application. */
const AGENT_EDITABLE_FIELDS = [
  "customer_full_name",
  "mobile_number",
  "email",
  "complete_address",
  "barangay",
  "city_municipality",
  "province",
  "landmark",
  "plan_id",
  "notes",
] as const;

function updateApplication(
  actor: Actor,
  payload: Record<string, unknown>,
  deps: CrudDependencies,
  envelope: InternalEnvelope,
): CrudResult {
  const applicationId = requiredString(
    payload.application_id,
    "application_id",
    200,
  );
  const expectedVersion = payload.version;
  if (typeof expectedVersion !== "number")
    throw new CrudValidationError("Invalid value for version.");

  const existing = deps.applicationsRepository.findById(applicationId);
  if (existing === null) throw new CrudNotFoundError();

  const wantsStatusChange = payload.current_status !== undefined;
  const coreFieldKeys = AGENT_EDITABLE_FIELDS.filter(
    (key) => payload[key] !== undefined,
  );

  if (actor.role === "Admin") {
    // Admin may edit core fields and/or reassign agent_id; status changes go
    // through the same transition authority as Processor per §C.
  } else if (actor.role === "Agent") {
    if (existing.agentId !== actor.userId) throw new CrudForbiddenError();
    if (existing.currentStatus !== "Pending") throw new CrudForbiddenError();
    if (wantsStatusChange || payload.agent_id !== undefined)
      throw new CrudForbiddenError();
  } else {
    // Processor: only status transitions on their assigned application,
    // never core/customer fields, never agent/processor reassignment.
    if (existing.processorId !== actor.userId) throw new CrudForbiddenError();
    if (coreFieldKeys.length > 0 || payload.agent_id !== undefined)
      throw new CrudForbiddenError();
    if (!wantsStatusChange) throw new CrudValidationError();
  }

  let newVersion: number;
  try {
    newVersion = assertCurrentVersion(
      { applicationId, version: existing.version },
      expectedVersion,
    );
  } catch (error) {
    if (error instanceof StaleVersionError) throw new CrudConflictError();
    throw error;
  }

  const changes: UpdateApplicationChanges = {
    version: newVersion,
    updatedAt: deps.clock.now().toISOString(),
  };

  let planNameSnapshot: string | undefined;
  let monthlyPriceSnapshot: number | undefined;
  if (payload.plan_id !== undefined) {
    const nextPlanId = requiredString(payload.plan_id, "plan_id", 200);
    const plan = deps.plansRepository.findById(nextPlanId);
    if (plan === null || plan.planStatus !== "Active")
      throw new CrudValidationError(
        "plan_id must reference an existing Active plan.",
      );
    changes.planId = nextPlanId;
    planNameSnapshot = plan.planName;
    monthlyPriceSnapshot = plan.monthlyPrice;
    changes.planNameSnapshot = plan.planName;
    changes.monthlyPriceSnapshot = plan.monthlyPrice;
  }
  if (payload.customer_full_name !== undefined)
    changes.customerFullName = requiredString(
      payload.customer_full_name,
      "customer_full_name",
      200,
    );
  if (payload.mobile_number !== undefined)
    changes.mobileNumber = requiredMobileNumber(payload.mobile_number);
  if (payload.email !== undefined)
    changes.email = optionalTrimmedString(payload.email, "email", 200);
  if (payload.complete_address !== undefined)
    changes.completeAddress = requiredString(
      payload.complete_address,
      "complete_address",
      400,
    );
  if (payload.barangay !== undefined)
    changes.barangay = requiredString(payload.barangay, "barangay", 120);
  if (payload.city_municipality !== undefined)
    changes.cityMunicipality = requiredString(
      payload.city_municipality,
      "city_municipality",
      120,
    );
  if (payload.province !== undefined)
    changes.province = requiredString(payload.province, "province", 120);
  if (payload.landmark !== undefined)
    changes.landmark = optionalTrimmedString(payload.landmark, "landmark", 200);
  if (actor.role === "Admin" && payload.agent_id !== undefined) {
    const nextAgentId = requiredString(payload.agent_id, "agent_id", 200);
    const agentUser = deps.usersRepository.findById(nextAgentId);
    if (agentUser === null || agentUser.role !== "Agent")
      throw new CrudValidationError(
        "agent_id must reference an existing Agent user.",
      );
    changes.agentId = nextAgentId;
  }

  let statusChanged = false;
  let fromStatus = existing.currentStatus;
  let toStatus = existing.currentStatus;
  let transitionNotes = "";
  let transitionJobOrder = existing.jobOrderNumber;
  if (wantsStatusChange) {
    if (!isApplicationStatus(payload.current_status))
      throw new CrudValidationError("Invalid current_status.");
    toStatus = payload.current_status;
    fromStatus = existing.currentStatus;
    transitionNotes =
      typeof payload.notes === "string" ? payload.notes.trim() : "";
    transitionJobOrder =
      typeof payload.job_order_number === "string"
        ? payload.job_order_number.trim()
        : existing.jobOrderNumber;
    const installedAt =
      typeof payload.installed_at === "string"
        ? payload.installed_at
        : undefined;

    const result = validateTransition({
      fromStatus,
      toStatus,
      notes: transitionNotes || undefined,
      jobOrderNumber: transitionJobOrder || undefined,
      installedAt,
      delayedFromStatus:
        typeof payload.delayed_from_status === "string" &&
        isApplicationStatus(payload.delayed_from_status) &&
        payload.delayed_from_status !== "Delayed" &&
        payload.delayed_from_status !== "Cancelled/Rejected" &&
        payload.delayed_from_status !== "Installed"
          ? payload.delayed_from_status
          : undefined,
      canReopenCancellation: actor.role === "Admin" ? true : undefined,
    });
    if (!result.valid) throw new CrudValidationError(result.issues[0]);

    changes.currentStatus = toStatus;
    changes.jobOrderNumber = transitionJobOrder;
    if (installedAt !== undefined) changes.installedAt = installedAt;
    if (transitionNotes) changes.notes = transitionNotes;
    statusChanged = true;
  } else if (payload.notes !== undefined) {
    changes.notes = optionalTrimmedString(payload.notes, "notes", 2000);
  }

  const updated = deps.applicationsRepository.update(
    existing as ApplicationRecordWithRow,
    changes,
  );

  appendActivityLog(
    deps.activityLogSheet,
    {
      actorUserId: actor.userId,
      action: statusChanged
        ? "APPLICATION_STATUS_CHANGE"
        : "APPLICATION_UPDATE",
      entityType: "Application",
      entityId: applicationId,
      requestId: envelope.jti,
      metadata: {
        changedFields: Object.keys(changes).filter(
          (k) => k !== "version" && k !== "updatedAt",
        ),
        ...(statusChanged ? { fromStatus, toStatus } : {}),
      },
    },
    deps.clock,
    deps.ids,
  );
  if (statusChanged) {
    appendStatusHistory(deps, {
      applicationId,
      fromStatus,
      toStatus,
      notes: transitionNotes,
      jobOrderNumber: transitionJobOrder,
      actorUserId: actor.userId,
      requestId: envelope.jti,
    });
  }
  void planNameSnapshot;
  void monthlyPriceSnapshot;
  return { data: updated, nextCursor: null };
}

/** POST /api/applications/:applicationId/assign — Admin only. */
function assignApplication(
  actor: Actor,
  payload: Record<string, unknown>,
  deps: CrudDependencies,
  envelope: InternalEnvelope,
): CrudResult {
  if (actor.role !== "Admin") throw new CrudForbiddenError();
  const applicationId = requiredString(
    payload.application_id,
    "application_id",
    200,
  );
  const expectedVersion = payload.version;
  if (typeof expectedVersion !== "number")
    throw new CrudValidationError("Invalid value for version.");
  const processorId = requiredString(payload.processor_id, "processor_id", 200);

  const existing = deps.applicationsRepository.findById(applicationId);
  if (existing === null) throw new CrudNotFoundError();

  const processorUser = deps.usersRepository.findById(processorId);
  if (
    processorUser === null ||
    processorUser.role !== "Processor" ||
    processorUser.accountStatus !== "Active"
  )
    throw new CrudValidationError(
      "processor_id must reference an existing, Active Processor user.",
    );

  let newVersion: number;
  try {
    newVersion = assertCurrentVersion(
      { applicationId, version: existing.version },
      expectedVersion,
    );
  } catch (error) {
    if (error instanceof StaleVersionError) throw new CrudConflictError();
    throw error;
  }

  const updated = deps.applicationsRepository.update(
    existing as ApplicationRecordWithRow,
    {
      processorId,
      version: newVersion,
      updatedAt: deps.clock.now().toISOString(),
    },
  );

  appendActivityLog(
    deps.activityLogSheet,
    {
      actorUserId: actor.userId,
      action: "APPLICATION_ASSIGN",
      entityType: "Application",
      entityId: applicationId,
      requestId: envelope.jti,
      metadata: { processorId },
    },
    deps.clock,
    deps.ids,
  );
  return { data: updated, nextCursor: null };
}

/** Re-exported for the CRUD ingress module's lock-conflict classification. */
export type { LockServiceAdapter };
export { withScriptLock };
