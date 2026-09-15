import { describe, expect, it } from "vitest";
import { executeCrud, type CrudDependencies } from "../core/crud-domain";
import {
  CrudConflictError,
  CrudForbiddenError,
  CrudNotFoundError,
  CrudValidationError,
} from "../core/crud-domain";
import type { AuthStore, AuthUser, StoredSession } from "../core/auth-domain";
import { AuthDenied } from "../core/auth-domain";
import type { AuthConfig } from "../core/auth-config";
import { signingInput } from "../core/auth-crypto";
import { PlansRepository } from "../core/plans-repository";
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

function buildDeps(store: Store, clock: Clock): CrudDependencies {
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
  const activityLogSheet = new MemorySheet();
  return {
    config,
    crypto,
    clock,
    ids: { generate: () => `id-${++id}` },
    authStore: store,
    lock: { run: <T>(work: () => T) => work() },
    plansRepository: new PlansRepository(sheet),
    activityLogSheet,
  };
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
