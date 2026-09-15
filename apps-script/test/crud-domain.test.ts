import { describe, expect, it } from "vitest";
import { executeCrud, type CrudDependencies } from "../core/crud-domain";
import {
  CrudConflictError,
  CrudForbiddenError,
  CrudLastAdminError,
  CrudNotFoundError,
  CrudValidationError,
} from "../core/crud-domain";
import type { AuthStore, AuthUser, StoredSession } from "../core/auth-domain";
import { AuthDenied } from "../core/auth-domain";
import type { AuthConfig } from "../core/auth-config";
import { signingInput } from "../core/auth-crypto";
import { PlansRepository } from "../core/plans-repository";
import { UsersRepository } from "../core/users-repository";
import { ApplicationsRepository } from "../core/applications-repository";
import { MemorySheet } from "./helpers";
import type { CrudOperation } from "../core/contracts";

const b64 = (letter: string) =>
  (/^[A-Za-z0-9_-]$/.test(letter) ? letter : "A").repeat(42) + "A";
const crypto = {
  sha256: (value: string) => b64(value[0] ?? "A"),
  hmacSha256: (secret: string, value: string) =>
    b64(
      String.fromCharCode(
        65 + ((secret.charCodeAt(0) + value.charCodeAt(0)) % 26),
      ),
    ),
};
const config: AuthConfig = {
  spreadsheetId: "abcdefghijklmnopqrstuvwxyz_123",
  audience: "hotech-globe-tracker.apps-script.nonprod",
  keys: new Map([["k1", { secret: "s".repeat(32), status: "active" }]]),
  activeKeyId: "k1",
  sessionTokenPepper: "p".repeat(32),
  csrfTokenPepper: "q".repeat(32),
  clockSkewSeconds: 30,
  assertionMaxTtlSeconds: 60,
  sessionIdleSeconds: 1800,
  sessionAbsoluteSeconds: 28800,
  sessionTouchSeconds: 300,
};

class Clock {
  value = new Date("2026-09-14T00:00:00.000Z");
  now() {
    return new Date(this.value);
  }
}

class Store implements AuthStore {
  usersRows: AuthUser[] = [];
  sessionsRows: StoredSession[] = [];
  replays: string[] = [];
  audits: string[] = [];
  users() {
    return this.usersRows.map((x) => ({ ...x }));
  }
  sessions() {
    return this.sessionsRows.map((x) => ({ ...x }));
  }
  replayExists(hash: string) {
    return this.replays.includes(hash);
  }
  appendReplay(value: { hash: string }) {
    this.replays.push(value.hash);
  }
  appendAudit(value: { action: string }) {
    this.audits.push(value.action);
  }
  updateUser(
    user: AuthUser,
    changes: Partial<Pick<AuthUser, "providerSubject">>,
  ) {
    Object.assign(
      this.usersRows.find((x) => x.userId === user.userId)!,
      changes,
    );
  }
  appendSession(session: Omit<StoredSession, "row">) {
    this.sessionsRows.push({ ...session, row: this.sessionsRows.length + 2 });
  }
  updateSession(session: StoredSession, changes: Partial<StoredSession>) {
    Object.assign(
      this.sessionsRows.find((x) => x.sessionId === session.sessionId)!,
      changes,
    );
  }
}

const OPERATION_PATHS: Record<CrudOperation, string> = {
  plans_list: "/internal/v1/crud/plans/list",
  plans_create: "/internal/v1/crud/plans/create",
  plans_update: "/internal/v1/crud/plans/update",
  users_list: "/internal/v1/crud/users/list",
  users_update: "/internal/v1/crud/users/update",
  applications_list: "/internal/v1/crud/applications/list",
  applications_get: "/internal/v1/crud/applications/get",
  applications_create: "/internal/v1/crud/applications/create",
  applications_update: "/internal/v1/crud/applications/update",
  applications_assign: "/internal/v1/crud/applications/assign",
};

function envelope(
  operation: CrudOperation,
  payload: Record<string, unknown>,
  clock: Clock,
) {
  const issued_at = clock.now().toISOString();
  const expires_at = new Date(clock.now().getTime() + 60000).toISOString();
  const body_digest = crypto.sha256(
    JSON.stringify(Object.fromEntries(Object.entries(payload).sort())),
  );
  const result: Record<string, unknown> = {
    version: "v1",
    key_id: "k1",
    audience: config.audience,
    issued_at,
    expires_at,
    jti: b64("J"),
    method: "POST",
    path: OPERATION_PATHS[operation],
    body_digest,
    signature: "",
    payload,
  };
  result.signature = crypto.hmacSha256(
    config.keys.get("k1")!.secret,
    signingInput({
      keyId: "k1",
      audience: config.audience,
      issuedAt: result.issued_at as string,
      expiresAt: result.expires_at as string,
      jti: result.jti as string,
      method: "POST",
      path: result.path as string,
      bodyDigest: result.body_digest as string,
    }),
  );
  return result;
}

function addUser(store: Store, overrides: Partial<AuthUser> = {}): AuthUser {
  const user: AuthUser = {
    userId: overrides.userId ?? `u-${store.usersRows.length + 1}`,
    email: overrides.email ?? "actor@example.com",
    accountStatus: overrides.accountStatus ?? "Active",
    role: overrides.role ?? "Admin",
    providerSubject: overrides.providerSubject ?? "sub-1",
    sessionVersion: overrides.sessionVersion ?? 1,
    row: overrides.row ?? store.usersRows.length + 2,
  };
  store.usersRows.push(user);
  return user;
}

let sessionTokenCounter = 0;

function addSession(
  store: Store,
  user: AuthUser,
  overrides: Partial<StoredSession> = {},
): { sessionToken: string; csrfToken: string } {
  sessionTokenCounter += 1;
  // Each call must mint a distinct token: b64() only varies by its first
  // character, so two sessions built from the same literal ("S"/"C") would
  // otherwise hash identically and the store would resolve to whichever
  // session was appended first, masking per-actor scoping bugs.
  const letters = "STUVWXYZ";
  const sessionToken = b64(letters[sessionTokenCounter % letters.length]);
  const csrfToken = b64(letters[(sessionTokenCounter + 3) % letters.length]);
  const session: StoredSession = {
    sessionId: overrides.sessionId ?? `sess-${store.sessionsRows.length + 1}`,
    sessionTokenHash: crypto.hmacSha256(
      config.sessionTokenPepper,
      sessionToken,
    ),
    userId: user.userId,
    issuedAt: "2026-09-14T00:00:00.000Z",
    lastSeenAt: "2026-09-14T00:00:00.000Z",
    idleExpiresAt: "2026-09-14T01:00:00.000Z",
    absoluteExpiresAt: "2026-09-14T08:00:00.000Z",
    revokedAt: null,
    sessionVersion: user.sessionVersion,
    csrfSecretHash: crypto.hmacSha256(config.csrfTokenPepper, csrfToken),
    row: store.sessionsRows.length + 2,
    ...overrides,
  };
  store.sessionsRows.push(session);
  return { sessionToken, csrfToken };
}

function buildDeps(
  store: Store,
  clock: Clock,
): CrudDependencies & {
  usersSheet: MemorySheet;
  plansSheet: MemorySheet;
  applicationsSheet: MemorySheet;
} {
  let id = 0;
  const sheet = new MemorySheet();
  sheet.appendRow([
    "plan_id",
    "plan_name",
    "monthly_price",
    "speed_mbps",
    "plan_status",
    "created_at",
    "updated_at",
  ]);
  const usersSheet = new MemorySheet();
  usersSheet.appendRow([
    "user_id",
    "email",
    "full_name",
    "mobile_number",
    "role",
    "account_status",
    "created_at",
    "updated_at",
  ]);
  const applicationsSheet = new MemorySheet();
  applicationsSheet.appendRow([
    "application_id",
    "customer_full_name",
    "mobile_number",
    "email",
    "complete_address",
    "barangay",
    "city_municipality",
    "province",
    "landmark",
    "plan_id",
    "plan_name_snapshot",
    "monthly_price_snapshot",
    "agent_id",
    "processor_id",
    "current_status",
    "job_order_number",
    "submitted_at",
    "installed_at",
    "notes",
    "version",
    "created_at",
    "updated_at",
  ]);
  const activityLogSheet = new MemorySheet();
  const statusHistorySheet = new MemorySheet();
  return {
    config,
    crypto,
    clock,
    ids: { generate: () => `id-${++id}` },
    authStore: store,
    lock: { run: <T>(work: () => T) => work() },
    plansRepository: new PlansRepository(sheet),
    usersRepository: new UsersRepository(usersSheet),
    applicationsRepository: new ApplicationsRepository(applicationsSheet),
    activityLogSheet,
    statusHistorySheet,
    usersSheet,
    plansSheet: sheet,
    applicationsSheet,
  };
}

function seedPlanRow(
  deps: { plansRepository: PlansRepository },
  overrides: Partial<{
    planId: string;
    planName: string;
    monthlyPrice: number;
    speedMbps: number;
    planStatus: "Active" | "Inactive";
  }> = {},
): void {
  deps.plansRepository.create({
    planId: overrides.planId ?? "plan-1",
    planName: overrides.planName ?? "Fiber 100",
    monthlyPrice: overrides.monthlyPrice ?? 1299,
    speedMbps: overrides.speedMbps ?? 100,
    planStatus: overrides.planStatus ?? "Active",
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  });
}

function seedUserRow(
  usersSheet: MemorySheet,
  input: {
    userId: string;
    email?: string;
    fullName?: string;
    mobileNumber?: string;
    role?: "Admin" | "Agent" | "Processor";
    accountStatus?: "Active" | "Inactive" | "Locked";
  },
): void {
  usersSheet.appendRow([
    input.userId,
    input.email ?? "user@example.com",
    input.fullName ?? "Jane Doe",
    input.mobileNumber ?? "09171234567",
    input.role ?? "Agent",
    input.accountStatus ?? "Active",
    "2026-09-14T00:00:00.000Z",
    "2026-09-14T00:00:00.000Z",
  ]);
}

describe("MVP-2A CRUD domain — Plans", () => {
  it("requires a valid session for every operation, never trusting a client-supplied actor", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    expect(() =>
      executeCrud(
        "plans_list",
        envelope("plans_list", { session_token: b64("Z") }, clock),
        deps,
      ),
    ).toThrow(AuthDenied);
  });

  it("Admin can list all plans; Agent/Processor only see Active plans", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    deps.plansRepository.create({
      planId: "plan-1",
      planName: "Fiber 100",
      monthlyPrice: 1299,
      speedMbps: 100,
      planStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    deps.plansRepository.create({
      planId: "plan-2",
      planName: "Fiber Legacy",
      monthlyPrice: 999,
      speedMbps: 50,
      planStatus: "Inactive",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });

    const admin = addUser(store, { role: "Admin" });
    const { sessionToken: adminToken } = addSession(store, admin);
    const adminResult = executeCrud(
      "plans_list",
      envelope("plans_list", { session_token: adminToken }, clock),
      deps,
    );
    expect((adminResult.data as unknown[]).length).toBe(2);

    const agent = addUser(store, { role: "Agent" });
    const { sessionToken: agentToken } = addSession(store, agent);
    const agentResult = executeCrud(
      "plans_list",
      envelope("plans_list", { session_token: agentToken }, clock),
      deps,
    );
    expect(
      (agentResult.data as { planStatus: string }[]).every(
        (p) => p.planStatus === "Active",
      ),
    ).toBe(true);
    expect((agentResult.data as unknown[]).length).toBe(1);
  });

  it("paginates using a bounded default page size and returns a nextCursor", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    for (let i = 0; i < 30; i += 1) {
      deps.plansRepository.create({
        planId: `plan-${i}`,
        planName: `Plan ${i}`,
        monthlyPrice: 100 + i,
        speedMbps: 50,
        planStatus: "Active",
        createdAt: "2026-09-14T00:00:00.000Z",
        updatedAt: "2026-09-14T00:00:00.000Z",
      });
    }
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken } = addSession(store, admin);
    const result = executeCrud(
      "plans_list",
      envelope("plans_list", { session_token: sessionToken }, clock),
      deps,
    );
    expect((result.data as unknown[]).length).toBe(25);
    expect(result.nextCursor).toBe("25");
  });

  it("Admin can create a plan; the actor and CSRF are derived from the session, never from the payload", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const admin = addUser(store, { role: "Admin", userId: "admin-1" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    const result = executeCrud(
      "plans_create",
      envelope(
        "plans_create",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          plan_name: "Fiber 200",
          monthly_price: 1599,
          speed_mbps: 200,
          plan_status: "Active",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({
      planName: "Fiber 200",
      monthlyPrice: 1599,
      speedMbps: 200,
      planStatus: "Active",
    });
    // appendActivityLog writes to the Activity_Logs sheet directly (not the
    // auth store's own appendAudit, which is reserved for AuthSession rows).
    const activityRows = (deps.activityLogSheet as MemorySheet).rows;
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0][1]).toBe("admin-1");
    expect(activityRows[0][2]).toBe("PLAN_CREATE");
  });

  it("rejects Agent/Processor plan creation with FORBIDDEN, never disclosing more detail", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const agent = addUser(store, { role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "plans_create",
        envelope(
          "plans_create",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            plan_name: "Fiber 200",
            monthly_price: 1599,
            speed_mbps: 200,
            plan_status: "Active",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("rejects an invalid plan_name/monthly_price/speed_mbps with CrudValidationError", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "plans_create",
        envelope(
          "plans_create",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            plan_name: "",
            monthly_price: 1599,
            speed_mbps: 200,
            plan_status: "Active",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);
    expect(() =>
      executeCrud(
        "plans_create",
        envelope(
          "plans_create",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            plan_name: "Fiber 200",
            monthly_price: -5,
            speed_mbps: 200,
            plan_status: "Active",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);
  });

  it("rejects plan creation without a valid CSRF token", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "plans_create",
        envelope(
          "plans_create",
          {
            session_token: sessionToken,
            csrf_token: b64("X"),
            plan_name: "Fiber 200",
            monthly_price: 1599,
            speed_mbps: 200,
            plan_status: "Active",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(AuthDenied);
  });

  it("Admin can update a plan using the optimistic updated_at concurrency token", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    deps.plansRepository.create({
      planId: "plan-1",
      planName: "Fiber 100",
      monthlyPrice: 1299,
      speedMbps: 100,
      planStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    const result = executeCrud(
      "plans_update",
      envelope(
        "plans_update",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          plan_id: "plan-1",
          expected_updated_at: "2026-09-14T00:00:00.000Z",
          monthly_price: 1399,
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({ planId: "plan-1", monthlyPrice: 1399 });
  });

  it("rejects a stale expected_updated_at with CrudConflictError", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    deps.plansRepository.create({
      planId: "plan-1",
      planName: "Fiber 100",
      monthlyPrice: 1299,
      speedMbps: 100,
      planStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "plans_update",
        envelope(
          "plans_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            plan_id: "plan-1",
            expected_updated_at: "2026-09-13T00:00:00.000Z",
            monthly_price: 1399,
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudConflictError);
  });

  it("returns CrudNotFoundError for a nonexistent plan_id", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "plans_update",
        envelope(
          "plans_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            plan_id: "does-not-exist",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            monthly_price: 1399,
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudNotFoundError);
  });

  it("rejects Agent/Processor plan updates with FORBIDDEN", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    deps.plansRepository.create({
      planId: "plan-1",
      planName: "Fiber 100",
      monthlyPrice: 1299,
      speedMbps: 100,
      planStatus: "Active",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const processor = addUser(store, { role: "Processor" });
    const { sessionToken, csrfToken } = addSession(store, processor);
    expect(() =>
      executeCrud(
        "plans_update",
        envelope(
          "plans_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            plan_id: "plan-1",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            monthly_price: 1399,
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("rejects a request from an inactive account even with a formerly valid session", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const admin = addUser(store, { role: "Admin", accountStatus: "Inactive" });
    const { sessionToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "plans_list",
        envelope("plans_list", { session_token: sessionToken }, clock),
        deps,
      ),
    ).toThrow(AuthDenied);
  });
});

describe("MVP-2B CRUD domain — Users", () => {
  it("Admin can list users; Agent/Processor are forbidden", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, { userId: "admin-1", role: "Admin" });
    seedUserRow(deps.usersSheet, { userId: "agent-1", role: "Agent" });

    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken: adminToken } = addSession(store, admin);
    const adminResult = executeCrud(
      "users_list",
      envelope("users_list", { session_token: adminToken }, clock),
      deps,
    );
    expect((adminResult.data as unknown[]).length).toBe(2);

    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken: agentToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "users_list",
        envelope("users_list", { session_token: agentToken }, clock),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("paginates users using the same bounded default page size as Plans", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    for (let i = 0; i < 30; i += 1) {
      seedUserRow(deps.usersSheet, { userId: `u-${i}`, role: "Agent" });
    }
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken } = addSession(store, admin);
    const result = executeCrud(
      "users_list",
      envelope("users_list", { session_token: sessionToken }, clock),
      deps,
    );
    expect((result.data as unknown[]).length).toBe(25);
    expect(result.nextCursor).toBe("25");
  });

  it("filters the users list by role and account_status", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "a1",
      role: "Agent",
      accountStatus: "Active",
    });
    seedUserRow(deps.usersSheet, {
      userId: "p1",
      role: "Processor",
      accountStatus: "Inactive",
    });
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken } = addSession(store, admin);
    const result = executeCrud(
      "users_list",
      envelope(
        "users_list",
        { session_token: sessionToken, role: "Agent" },
        clock,
      ),
      deps,
    );
    expect((result.data as { userId: string }[]).map((u) => u.userId)).toEqual([
      "a1",
    ]);
  });

  it("Admin can update another user's role and account_status", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "agent-1",
      role: "Agent",
      accountStatus: "Active",
    });
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    const result = executeCrud(
      "users_update",
      envelope(
        "users_update",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          user_id: "agent-1",
          expected_updated_at: "2026-09-14T00:00:00.000Z",
          role: "Processor",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({ userId: "agent-1", role: "Processor" });
    const activityRows = deps.activityLogSheet.rows;
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0][1]).toBe("admin-1");
    expect(activityRows[0][2]).toBe("USER_UPDATE");
  });

  it("rejects a non-Admin updating another user's role/account_status with FORBIDDEN", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "agent-1",
      role: "Agent",
      accountStatus: "Active",
    });
    seedUserRow(deps.usersSheet, {
      userId: "agent-2",
      role: "Agent",
      accountStatus: "Active",
    });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            user_id: "agent-2",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            full_name: "Changed Name",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("allows any authenticated role to update their OWN full_name/mobile_number", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "processor-1",
      role: "Processor",
      accountStatus: "Active",
    });
    const processor = addUser(store, {
      userId: "processor-1",
      role: "Processor",
    });
    const { sessionToken, csrfToken } = addSession(store, processor);
    const result = executeCrud(
      "users_update",
      envelope(
        "users_update",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          user_id: "processor-1",
          expected_updated_at: "2026-09-14T00:00:00.000Z",
          full_name: "New Name",
          mobile_number: "09170001111",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({
      userId: "processor-1",
      fullName: "New Name",
      mobileNumber: "09170001111",
    });
  });

  it("rejects a non-Admin trying to change their own role/account_status via the profile route", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "agent-1",
      role: "Agent",
      accountStatus: "Active",
    });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            user_id: "agent-1",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            role: "Admin",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("prevents an Admin from moving their own role away from Admin (unsafe self-escalation-away block)", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "admin-1",
      role: "Admin",
      accountStatus: "Active",
    });
    seedUserRow(deps.usersSheet, {
      userId: "admin-2",
      role: "Admin",
      accountStatus: "Active",
    });
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            user_id: "admin-1",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            role: "Agent",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("prevents removing the last active Admin via a role change", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "admin-1",
      role: "Admin",
      accountStatus: "Active",
    });
    // A second Admin acts on the first (the only-other-admin case): still
    // the last ACTIVE admin overall would become zero only if admin-1 is the
    // sole active admin; here we simulate the sole-admin case directly by
    // having admin-1 be acted on by an Admin session bound to admin-1 itself
    // being excluded from the count. To exercise the true "last admin"
    // rejection independent of self-escalation, a second Admin (admin-2)
    // performs the change on admin-1 while admin-2 is not Active, so only
    // admin-1 counts as active.
    seedUserRow(deps.usersSheet, {
      userId: "admin-2",
      role: "Admin",
      accountStatus: "Inactive",
    });
    const admin2 = addUser(store, { userId: "admin-2", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin2);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            user_id: "admin-1",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            role: "Agent",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudLastAdminError);
  });

  it("prevents removing the last active Admin via an account_status change to Inactive", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "admin-1",
      role: "Admin",
      accountStatus: "Active",
    });
    seedUserRow(deps.usersSheet, {
      userId: "admin-2",
      role: "Admin",
      accountStatus: "Inactive",
    });
    const admin2 = addUser(store, { userId: "admin-2", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin2);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            user_id: "admin-1",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            account_status: "Locked",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudLastAdminError);
  });

  it("allows a role change away from Admin when another active Admin remains", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, {
      userId: "admin-1",
      role: "Admin",
      accountStatus: "Active",
    });
    seedUserRow(deps.usersSheet, {
      userId: "admin-2",
      role: "Admin",
      accountStatus: "Active",
    });
    const admin2 = addUser(store, { userId: "admin-2", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin2);
    const result = executeCrud(
      "users_update",
      envelope(
        "users_update",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          user_id: "admin-1",
          expected_updated_at: "2026-09-14T00:00:00.000Z",
          role: "Agent",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({ userId: "admin-1", role: "Agent" });
  });

  it("rejects a stale expected_updated_at with CrudConflictError", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, { userId: "agent-1", role: "Agent" });
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            user_id: "agent-1",
            expected_updated_at: "2026-09-13T00:00:00.000Z",
            full_name: "Changed",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudConflictError);
  });

  it("returns CrudNotFoundError for a nonexistent user_id", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            user_id: "does-not-exist",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            full_name: "Changed",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudNotFoundError);
  });

  it("rejects an invalid mobile_number with CrudValidationError", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, { userId: "agent-1", role: "Agent" });
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            user_id: "agent-1",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            mobile_number: "abc",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);
  });

  it("rejects a user update without a valid CSRF token", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, { userId: "agent-1", role: "Agent" });
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "users_update",
        envelope(
          "users_update",
          {
            session_token: sessionToken,
            csrf_token: b64("X"),
            user_id: "agent-1",
            expected_updated_at: "2026-09-14T00:00:00.000Z",
            full_name: "Changed",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(AuthDenied);
  });

  it("appends exactly one Activity_Logs row shaped for a User entity on update", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedUserRow(deps.usersSheet, { userId: "agent-1", role: "Agent" });
    const admin = addUser(store, { userId: "admin-1", role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    executeCrud(
      "users_update",
      envelope(
        "users_update",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          user_id: "agent-1",
          expected_updated_at: "2026-09-14T00:00:00.000Z",
          full_name: "Changed Name",
        },
        clock,
      ),
      deps,
    );
    const rows = deps.activityLogSheet.rows;
    expect(rows).toHaveLength(1);
    const [
      logId,
      actorUserId,
      action,
      entityType,
      entityId,
      requestId,
      metadataJson,
      occurredAt,
    ] = rows[0];
    expect(typeof logId).toBe("string");
    expect(actorUserId).toBe("admin-1");
    expect(action).toBe("USER_UPDATE");
    expect(entityType).toBe("User");
    expect(entityId).toBe("agent-1");
    expect(typeof requestId).toBe("string");
    expect(() => JSON.parse(String(metadataJson))).not.toThrow();
    expect(typeof occurredAt).toBe("string");
  });
});

describe("MVP-2C/2D/2E CRUD domain — Applications", () => {
  it("Admin sees all applications; Agent sees only own; Processor sees only assigned", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "proc-1",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    deps.applicationsRepository.create({
      applicationId: "a2",
      customerFullName: "Customer B",
      mobileNumber: "09172222222",
      email: "",
      completeAddress: "Addr B",
      barangay: "Brgy B",
      cityMunicipality: "City B",
      province: "Province B",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-2",
      processorId: "",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });

    const admin = addUser(store, { role: "Admin" });
    const { sessionToken: adminToken } = addSession(store, admin);
    const adminResult = executeCrud(
      "applications_list",
      envelope("applications_list", { session_token: adminToken }, clock),
      deps,
    );
    expect((adminResult.data as unknown[]).length).toBe(2);

    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken: agentToken } = addSession(store, agent);
    const agentResult = executeCrud(
      "applications_list",
      envelope("applications_list", { session_token: agentToken }, clock),
      deps,
    );
    expect(
      (agentResult.data as { applicationId: string }[]).map(
        (a) => a.applicationId,
      ),
    ).toEqual(["a1"]);

    const processor = addUser(store, { userId: "proc-1", role: "Processor" });
    const { sessionToken: procToken } = addSession(store, processor);
    const procResult = executeCrud(
      "applications_list",
      envelope("applications_list", { session_token: procToken }, clock),
      deps,
    );
    expect(
      (procResult.data as { applicationId: string }[]).map(
        (a) => a.applicationId,
      ),
    ).toEqual(["a1"]);
  });

  it("ignores a client-supplied agent_id filter as authorization for a non-Admin", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-other",
      processorId: "",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken } = addSession(store, agent);
    const result = executeCrud(
      "applications_list",
      envelope(
        "applications_list",
        { session_token: sessionToken, agent_id: "agent-other" },
        clock,
      ),
      deps,
    );
    expect((result.data as unknown[]).length).toBe(0);
  });

  it("GET returns FORBIDDEN (not NOT_FOUND) for a row the actor may not read", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-other",
      processorId: "",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "applications_get",
        envelope(
          "applications_get",
          { session_token: sessionToken, application_id: "a1" },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("returns CrudNotFoundError for a nonexistent application_id on get", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken } = addSession(store, admin);
    expect(() =>
      executeCrud(
        "applications_get",
        envelope(
          "applications_get",
          { session_token: sessionToken, application_id: "missing" },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudNotFoundError);
  });

  it("Agent creates an application; agent_id is always session-derived, never client-supplied", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    const result = executeCrud(
      "applications_create",
      envelope(
        "applications_create",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          customer_full_name: "Juan Dela Cruz",
          mobile_number: "09171234567",
          complete_address: "123 Rizal St",
          barangay: "Barangay 1",
          city_municipality: "Quezon City",
          province: "Metro Manila",
          plan_id: "plan-1",
          agent_id: "someone-else",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({
      agentId: "agent-1",
      currentStatus: "Pending",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      version: 1,
    });
    const statusRows = deps.statusHistorySheet.rows;
    expect(statusRows).toHaveLength(1);
    expect(statusRows[0][2]).toBe("");
    expect(statusRows[0][3]).toBe("Pending");
  });

  it("Admin creating an application requires an explicit agent_id referencing an existing Agent user", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    seedUserRow(deps.usersSheet, { userId: "agent-1", role: "Agent" });
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    const result = executeCrud(
      "applications_create",
      envelope(
        "applications_create",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          customer_full_name: "Juan Dela Cruz",
          mobile_number: "09171234567",
          complete_address: "123 Rizal St",
          barangay: "Barangay 1",
          city_municipality: "Quezon City",
          province: "Metro Manila",
          plan_id: "plan-1",
          agent_id: "agent-1",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({ agentId: "agent-1" });

    expect(() =>
      executeCrud(
        "applications_create",
        envelope(
          "applications_create",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            customer_full_name: "Juan Dela Cruz",
            mobile_number: "09171234567",
            complete_address: "123 Rizal St",
            barangay: "Barangay 1",
            city_municipality: "Quezon City",
            province: "Metro Manila",
            plan_id: "plan-1",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);
  });

  it("rejects Processor creating an application with FORBIDDEN", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    const processor = addUser(store, { role: "Processor" });
    const { sessionToken, csrfToken } = addSession(store, processor);
    expect(() =>
      executeCrud(
        "applications_create",
        envelope(
          "applications_create",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            customer_full_name: "Juan Dela Cruz",
            mobile_number: "09171234567",
            complete_address: "123 Rizal St",
            barangay: "Barangay 1",
            city_municipality: "Quezon City",
            province: "Metro Manila",
            plan_id: "plan-1",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("rejects plan_id referencing an Inactive plan with CrudValidationError", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps, { planId: "plan-2", planStatus: "Inactive" });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "applications_create",
        envelope(
          "applications_create",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            customer_full_name: "Juan Dela Cruz",
            mobile_number: "09171234567",
            complete_address: "123 Rizal St",
            barangay: "Barangay 1",
            city_municipality: "Quezon City",
            province: "Metro Manila",
            plan_id: "plan-2",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);
  });

  it("Agent can edit core fields on their own Pending application", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Old Name",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    const result = executeCrud(
      "applications_update",
      envelope(
        "applications_update",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          application_id: "a1",
          version: 1,
          customer_full_name: "New Name",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({
      applicationId: "a1",
      customerFullName: "New Name",
      version: 2,
    });
  });

  it("rejects an Agent editing another agent's application with FORBIDDEN", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Old Name",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-other",
      processorId: "",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "applications_update",
        envelope(
          "applications_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 1,
            customer_full_name: "New Name",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("rejects an Agent editing their own application once it is no longer Pending", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Old Name",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "",
      currentStatus: "Transmitted",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "applications_update",
        envelope(
          "applications_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 1,
            customer_full_name: "New Name",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("Processor performs an allowed status transition on their assigned application, with a Status_History row", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "proc-1",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const processor = addUser(store, { userId: "proc-1", role: "Processor" });
    const { sessionToken, csrfToken } = addSession(store, processor);
    const result = executeCrud(
      "applications_update",
      envelope(
        "applications_update",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          application_id: "a1",
          version: 1,
          current_status: "Transmitted",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({
      applicationId: "a1",
      currentStatus: "Transmitted",
      version: 2,
    });
    const statusRows = deps.statusHistorySheet.rows;
    expect(statusRows).toHaveLength(1);
    expect(statusRows[0][2]).toBe("Pending");
    expect(statusRows[0][3]).toBe("Transmitted");
    const activityRows = deps.activityLogSheet.rows;
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0][2]).toBe("APPLICATION_STATUS_CHANGE");
  });

  it("rejects a Processor transition on an application not assigned to them", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "proc-other",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const processor = addUser(store, { userId: "proc-1", role: "Processor" });
    const { sessionToken, csrfToken } = addSession(store, processor);
    expect(() =>
      executeCrud(
        "applications_update",
        envelope(
          "applications_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 1,
            current_status: "Transmitted",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });

  it("rejects an invalid status transition via validateTransition (frozen policy)", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "proc-1",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const processor = addUser(store, { userId: "proc-1", role: "Processor" });
    const { sessionToken, csrfToken } = addSession(store, processor);
    expect(() =>
      executeCrud(
        "applications_update",
        envelope(
          "applications_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 1,
            current_status: "Installed",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);
  });

  it("requires job_order_number for With Job Order", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "proc-1",
      currentStatus: "Transmitted",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const processor = addUser(store, { userId: "proc-1", role: "Processor" });
    const { sessionToken, csrfToken } = addSession(store, processor);
    expect(() =>
      executeCrud(
        "applications_update",
        envelope(
          "applications_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 1,
            current_status: "With Job Order",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);
  });

  it("rejects a stale version with CrudConflictError (assertCurrentVersion)", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "proc-1",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const processor = addUser(store, { userId: "proc-1", role: "Processor" });
    const { sessionToken, csrfToken } = addSession(store, processor);
    expect(() =>
      executeCrud(
        "applications_update",
        envelope(
          "applications_update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 2,
            current_status: "Transmitted",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudConflictError);
  });

  it("Admin assigns a Processor; rejects assigning a non-Processor or inactive Processor", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    seedUserRow(deps.usersSheet, {
      userId: "proc-1",
      role: "Processor",
      accountStatus: "Active",
    });
    seedUserRow(deps.usersSheet, {
      userId: "agent-1",
      role: "Agent",
      accountStatus: "Active",
    });
    seedUserRow(deps.usersSheet, {
      userId: "proc-inactive",
      role: "Processor",
      accountStatus: "Inactive",
    });
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken, csrfToken } = addSession(store, admin);
    const result = executeCrud(
      "applications_assign",
      envelope(
        "applications_assign",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          application_id: "a1",
          version: 1,
          processor_id: "proc-1",
        },
        clock,
      ),
      deps,
    );
    expect(result.data).toMatchObject({
      applicationId: "a1",
      processorId: "proc-1",
    });

    expect(() =>
      executeCrud(
        "applications_assign",
        envelope(
          "applications_assign",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 2,
            processor_id: "agent-1",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);

    expect(() =>
      executeCrud(
        "applications_assign",
        envelope(
          "applications_assign",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 2,
            processor_id: "proc-inactive",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudValidationError);
  });

  it("rejects a non-Admin assigning a Processor with FORBIDDEN", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    seedPlanRow(deps);
    seedUserRow(deps.usersSheet, { userId: "proc-1", role: "Processor" });
    deps.applicationsRepository.create({
      applicationId: "a1",
      customerFullName: "Customer A",
      mobileNumber: "09171111111",
      email: "",
      completeAddress: "Addr A",
      barangay: "Brgy A",
      cityMunicipality: "City A",
      province: "Province A",
      landmark: "",
      planId: "plan-1",
      planNameSnapshot: "Fiber 100",
      monthlyPriceSnapshot: 1299,
      agentId: "agent-1",
      processorId: "",
      currentStatus: "Pending",
      jobOrderNumber: "",
      submittedAt: "2026-09-14T00:00:00.000Z",
      installedAt: "",
      notes: "",
      version: 1,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    const agent = addUser(store, { userId: "agent-1", role: "Agent" });
    const { sessionToken, csrfToken } = addSession(store, agent);
    expect(() =>
      executeCrud(
        "applications_assign",
        envelope(
          "applications_assign",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            application_id: "a1",
            version: 1,
            processor_id: "proc-1",
          },
          clock,
        ),
        deps,
      ),
    ).toThrow(CrudForbiddenError);
  });
});

describe("MVP-2F integration verification — lock-conflict propagation", () => {
  it("propagates a lock-acquisition failure from deps.lock.run unchanged for every entity", () => {
    const store = new Store();
    const clock = new Clock();
    const deps = buildDeps(store, clock);
    const admin = addUser(store, { role: "Admin" });
    const { sessionToken } = addSession(store, admin);
    class LockBusyError extends Error {}
    const lockedDeps: CrudDependencies = {
      ...deps,
      lock: {
        run: () => {
          throw new LockBusyError();
        },
      },
    };
    expect(() =>
      executeCrud(
        "plans_list",
        envelope("plans_list", { session_token: sessionToken }, clock),
        lockedDeps,
      ),
    ).toThrow(LockBusyError);
    expect(() =>
      executeCrud(
        "applications_list",
        envelope("applications_list", { session_token: sessionToken }, clock),
        lockedDeps,
      ),
    ).toThrow(LockBusyError);
  });
});
