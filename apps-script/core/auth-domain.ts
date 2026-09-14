import type { AuthConfig } from "./auth-config";
import {
  hashSecret,
  isCanonicalBase64Url,
  constantTimeEquals,
} from "./auth-crypto";
import { verifyEnvelope, type InternalEnvelope } from "./auth-envelope";
import type { Clock, UuidGenerator } from "./contracts";
import type { CryptoAdapter } from "./auth-crypto";
import {
  decideFirstProviderBind,
  normalizeEmail,
  type PreprovisionedUser,
} from "./first-bind";
import {
  createSessionRecord,
  touchSession,
  validateSession,
  revokeSession,
  type SessionRecord,
} from "./session-lifecycle";

export type Operation =
  | "login_first_bind"
  | "validate_session"
  | "rotate_session"
  | "issue_csrf"
  | "logout"
  | "revoke_session";
const OPERATIONS: Record<
  Operation,
  { method: string; path: string; replay: boolean }
> = {
  login_first_bind: {
    method: "POST",
    path: "/internal/v1/auth/login-first-bind",
    replay: true,
  },
  validate_session: {
    method: "POST",
    path: "/internal/v1/auth/session/validate",
    replay: false,
  },
  rotate_session: {
    method: "POST",
    path: "/internal/v1/auth/session/rotate",
    replay: true,
  },
  issue_csrf: {
    method: "POST",
    path: "/internal/v1/auth/csrf/issue",
    replay: true,
  },
  logout: { method: "POST", path: "/internal/v1/auth/logout", replay: true },
  revoke_session: {
    method: "POST",
    path: "/internal/v1/auth/session/revoke",
    replay: true,
  },
};
export interface AuthUser extends PreprovisionedUser {
  role: string;
  sessionVersion: number;
  row: number;
}
export interface StoredSession extends SessionRecord {
  sessionTokenHash: string;
  csrfSecretHash: string;
  row: number;
}
export interface AuthStore {
  users(): AuthUser[];
  sessions(): StoredSession[];
  replayExists(hash: string): boolean;
  appendReplay(values: {
    replayId: string;
    hash: string;
    purpose: string;
    digest: string;
    issuedAt: string;
    expiresAt: string;
    sessionId: string;
    userId: string;
  }): void;
  appendAudit(input: {
    actorUserId: string;
    action: string;
    entityId: string;
    requestId: string;
    metadata: Record<string, string>;
  }): void;
  updateUser(
    user: AuthUser,
    changes: Partial<Pick<AuthUser, "providerSubject">>,
  ): void;
  appendSession(session: Omit<StoredSession, "row">): void;
  updateSession(session: StoredSession, changes: Partial<StoredSession>): void;
}
export interface Lock {
  run<T>(work: () => T): T;
}
export interface AuthDomainDependencies {
  config: AuthConfig;
  crypto: CryptoAdapter;
  clock: Clock;
  ids: UuidGenerator;
  store: AuthStore;
  lock: Lock;
}
export class AuthDenied extends Error {
  constructor() {
    super("Authentication was not accepted.");
    this.name = "AuthDenied";
  }
}
function supportedRole(role: string): role is "Admin" | "Agent" | "Processor" {
  return role === "Admin" || role === "Agent" || role === "Processor";
}
function token(value: unknown): string {
  if (typeof value !== "string" || !isCanonicalBase64Url(value, 32))
    throw new AuthDenied();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value === "") throw new AuthDenied();
  return value;
}
function sessionFor(
  store: AuthStore,
  crypto: CryptoAdapter,
  pepper: string,
  raw: string,
): StoredSession {
  const hash = hashSecret(crypto, pepper, raw);
  const found = store
    .sessions()
    .find((item) => constantTimeEquals(item.sessionTokenHash, hash));
  if (found === undefined) throw new AuthDenied();
  return found;
}
function validSession(
  deps: AuthDomainDependencies,
  raw: string,
): { session: StoredSession; user: AuthUser } {
  const session = sessionFor(
    deps.store,
    deps.crypto,
    deps.config.sessionTokenPepper,
    raw,
  );
  const user = deps.store
    .users()
    .find((item) => item.userId === session.userId);
  if (
    user === undefined ||
    user.accountStatus !== "Active" ||
    !supportedRole(user.role) ||
    validateSession(session, user.sessionVersion, deps.clock) !== "valid"
  )
    throw new AuthDenied();
  return { session, user };
}
function requireCsrf(
  deps: AuthDomainDependencies,
  session: StoredSession,
  raw: unknown,
): void {
  const csrf = token(raw);
  if (
    !constantTimeEquals(
      session.csrfSecretHash,
      hashSecret(deps.crypto, deps.config.csrfTokenPepper, csrf),
    )
  )
    throw new AuthDenied();
}
function audit(
  deps: AuthDomainDependencies,
  actorUserId: string,
  action: string,
  entityId: string,
  requestId: string,
  result: string,
): void {
  deps.store.appendAudit({
    actorUserId,
    action,
    entityId,
    requestId,
    metadata: { purpose: action, result },
  });
}
function consume(
  deps: AuthDomainDependencies,
  envelope: InternalEnvelope,
  operation: Operation,
): void {
  const hash = deps.crypto.sha256(envelope.jti);
  if (deps.store.replayExists(hash)) throw new AuthDenied();
  deps.store.appendReplay({
    replayId: deps.ids.generate(),
    hash,
    purpose: operation,
    digest: envelope.body_digest,
    issuedAt: envelope.issued_at,
    expiresAt: envelope.expires_at,
    sessionId: "",
    userId: "",
  });
}
function create(
  deps: AuthDomainDependencies,
  user: AuthUser,
  sessionToken: string,
  csrfToken: string,
): { sessionId: string } {
  const record = createSessionRecord(deps.clock, {
    // This is an opaque server record identifier, not authentication material.
    // Token entropy remains exclusively in the BFF-supplied session token.
    sessionId: deps.ids.generate(),
    userId: user.userId,
    sessionVersion: user.sessionVersion,
  });
  deps.store.appendSession({
    ...record,
    sessionTokenHash: hashSecret(
      deps.crypto,
      deps.config.sessionTokenPepper,
      sessionToken,
    ),
    csrfSecretHash: hashSecret(
      deps.crypto,
      deps.config.csrfTokenPepper,
      csrfToken,
    ),
  });
  return { sessionId: record.sessionId };
}

/** Internal-only dispatcher. It is intentionally not called by doGet/doPost. */
export function executeInternalAuth(
  operation: Operation,
  raw: unknown,
  deps: AuthDomainDependencies,
): { userId?: string; role?: string; sessionId?: string } {
  const contract = OPERATIONS[operation];
  const verified = verifyEnvelope(
    raw,
    contract,
    deps.config,
    deps.clock,
    deps.crypto,
  );
  return deps.lock.run(() => {
    const auditRequestId = deps.ids.generate();
    if (contract.replay) consume(deps, verified.envelope, operation);
    const payload = verified.envelope.payload;
    if (operation === "login_first_bind") {
      const email = text(payload.email);
      const subject = text(payload.sub);
      if (payload.email_verified !== true) throw new AuthDenied();
      const users = deps.store.users();
      const decision = decideFirstProviderBind({
        lockHeld: true,
        emailVerified: true,
        email,
        providerSubject: subject,
        users,
      });
      if (decision !== "allow") throw new AuthDenied();
      const user = users.filter(
        (item) =>
          item.accountStatus === "Active" &&
          normalizeEmail(item.email) === normalizeEmail(email),
      )[0];
      if (!supportedRole(user.role)) throw new AuthDenied();
      audit(
        deps,
        user.userId,
        "AUTH_LOGIN_INTENT",
        user.userId,
        auditRequestId,
        "intent",
      );
      if (!user.providerSubject)
        deps.store.updateUser(user, { providerSubject: subject });
      // A successful idempotent login replaces any surviving prior session.
      for (const prior of deps.store.sessions()) {
        if (prior.userId === user.userId && prior.revokedAt === null)
          deps.store.updateSession(prior, revokeSession(prior, deps.clock));
      }
      const sessionToken = token(payload.session_token);
      const csrfToken = token(payload.csrf_token);
      const created = create(deps, user, sessionToken, csrfToken);
      audit(
        deps,
        user.userId,
        "AUTH_LOGIN_COMPLETE",
        created.sessionId,
        auditRequestId,
        "complete",
      );
      return {
        userId: user.userId,
        role: user.role,
        sessionId: created.sessionId,
      };
    }
    const current = validSession(deps, token(payload.session_token));
    if (operation === "validate_session") {
      const touched = touchSession(
        current.session,
        current.user.sessionVersion,
        deps.clock,
      );
      if (touched !== current.session)
        deps.store.updateSession(current.session, touched);
      return {
        userId: current.user.userId,
        role: current.user.role,
        sessionId: current.session.sessionId,
      };
    }
    if (operation === "revoke_session") {
      if (current.user.role !== "Admin") throw new AuthDenied();
      const target = text(payload.target_session_id);
      const targetSession = deps.store
        .sessions()
        .find((item) => item.sessionId === target);
      if (targetSession === undefined) throw new AuthDenied();
      audit(
        deps,
        current.user.userId,
        "SESSION_REVOKE_INTENT",
        target,
        auditRequestId,
        "intent",
      );
      deps.store.updateSession(
        targetSession,
        revokeSession(targetSession, deps.clock),
      );
      audit(
        deps,
        current.user.userId,
        "SESSION_REVOKE_COMPLETE",
        target,
        auditRequestId,
        "complete",
      );
      return { userId: current.user.userId, role: current.user.role };
    }
    requireCsrf(deps, current.session, payload.csrf_token);
    if (operation === "issue_csrf") {
      audit(
        deps,
        current.user.userId,
        "CSRF_ISSUE_INTENT",
        current.session.sessionId,
        auditRequestId,
        "intent",
      );
      deps.store.updateSession(current.session, {
        csrfSecretHash: hashSecret(
          deps.crypto,
          deps.config.csrfTokenPepper,
          token(payload.next_csrf_token),
        ),
      });
      audit(
        deps,
        current.user.userId,
        "CSRF_ISSUE_COMPLETE",
        current.session.sessionId,
        auditRequestId,
        "complete",
      );
      return {
        userId: current.user.userId,
        role: current.user.role,
        sessionId: current.session.sessionId,
      };
    }
    audit(
      deps,
      current.user.userId,
      operation === "logout" ? "LOGOUT_INTENT" : "SESSION_ROTATE_INTENT",
      current.session.sessionId,
      auditRequestId,
      "intent",
    );
    deps.store.updateSession(
      current.session,
      revokeSession(current.session, deps.clock),
    );
    if (operation === "rotate_session") {
      const replacement = create(
        deps,
        current.user,
        token(payload.next_session_token),
        token(payload.next_csrf_token),
      );
      audit(
        deps,
        current.user.userId,
        "SESSION_ROTATE_COMPLETE",
        replacement.sessionId,
        auditRequestId,
        "complete",
      );
      return {
        userId: current.user.userId,
        role: current.user.role,
        sessionId: replacement.sessionId,
      };
    }
    audit(
      deps,
      current.user.userId,
      "LOGOUT_COMPLETE",
      current.session.sessionId,
      auditRequestId,
      "complete",
    );
    return { userId: current.user.userId, role: current.user.role };
  });
}
