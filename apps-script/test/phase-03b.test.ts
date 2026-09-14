import { describe, expect, it } from "vitest";
import {
  executeInternalAuth,
  type AuthStore,
  type AuthUser,
  type StoredSession,
} from "../core/auth-domain";
import type { AuthConfig } from "../core/auth-config";
import { signingInput } from "../core/auth-crypto";
import { verifyEnvelope } from "../core/auth-envelope";

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
const token = b64("E");
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
  advance(seconds: number) {
    this.value = new Date(this.value.getTime() + seconds * 1000);
  }
}
class Store implements AuthStore {
  usersRows: AuthUser[] = [
    {
      userId: "u1",
      email: "agent@example.com",
      accountStatus: "Active",
      role: "Agent",
      providerSubject: null,
      sessionVersion: 1,
      row: 2,
    },
  ];
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
function envelope(
  operation:
    | "login_first_bind"
    | "validate_session"
    | "logout"
    | "rotate_session"
    | "issue_csrf",
  payload: Record<string, unknown>,
  clock: Clock,
  changes: Record<string, unknown> = {},
) {
  const paths = {
    login_first_bind: "/internal/v1/auth/login-first-bind",
    validate_session: "/internal/v1/auth/session/validate",
    logout: "/internal/v1/auth/logout",
    rotate_session: "/internal/v1/auth/session/rotate",
    issue_csrf: "/internal/v1/auth/csrf/issue",
  };
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
    path: paths[operation],
    body_digest,
    signature: "",
    payload,
    ...changes,
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
function deps(store: Store, clock: Clock) {
  let id = 0;
  return {
    config,
    crypto,
    clock,
    ids: { generate: () => `id-${++id}` },
    store,
    lock: { run: <T>(work: () => T) => work() },
  };
}

describe("Phase 03B envelope and session domain", () => {
  it("rejects padded/non-canonical binary fields before replay work", () => {
    const clock = new Clock();
    const value = envelope(
      "validate_session",
      { session_token: token },
      clock,
      { jti: `${b64("J")}=`, signature: b64("S") },
    );
    expect(() =>
      verifyEnvelope(
        value,
        { method: "POST", path: "/internal/v1/auth/session/validate" },
        config,
        clock,
        crypto,
      ),
    ).toThrow();
  });
  it("binds once, stores only peppered token hashes, and rejects replay", () => {
    const clock = new Clock();
    const store = new Store();
    const request = envelope(
      "login_first_bind",
      {
        email: "Agent@Example.com",
        sub: "google-sub",
        email_verified: true,
        session_token: token,
        csrf_token: b64("F"),
      },
      clock,
    );
    const result = executeInternalAuth(
      "login_first_bind",
      request,
      deps(store, clock),
    );
    expect(result.role).toBe("Agent");
    expect(store.sessionsRows[0].sessionTokenHash).not.toBe(token);
    expect(store.replays).toHaveLength(1);
    expect(() =>
      executeInternalAuth("login_first_bind", request, deps(store, clock)),
    ).toThrow();
  });
  it("does not consume read-only validation and throttles touch", () => {
    const clock = new Clock();
    const store = new Store();
    executeInternalAuth(
      "login_first_bind",
      envelope(
        "login_first_bind",
        {
          email: "agent@example.com",
          sub: "sub",
          email_verified: true,
          session_token: token,
          csrf_token: b64("F"),
        },
        clock,
      ),
      deps(store, clock),
    );
    const seen = store.sessionsRows[0].lastSeenAt;
    clock.advance(299);
    executeInternalAuth(
      "validate_session",
      envelope("validate_session", { session_token: token }, clock),
      deps(store, clock),
    );
    expect(store.replays).toHaveLength(1);
    expect(store.sessionsRows[0].lastSeenAt).toBe(seen);
    clock.advance(1);
    executeInternalAuth(
      "validate_session",
      envelope("validate_session", { session_token: token }, clock),
      deps(store, clock),
    );
    expect(store.sessionsRows[0].lastSeenAt).not.toBe(seen);
  });
  it("requires CSRF to logout and revokes idempotently with a new assertion", () => {
    const clock = new Clock();
    const store = new Store();
    executeInternalAuth(
      "login_first_bind",
      envelope(
        "login_first_bind",
        {
          email: "agent@example.com",
          sub: "sub",
          email_verified: true,
          session_token: token,
          csrf_token: b64("F"),
        },
        clock,
      ),
      deps(store, clock),
    );
    expect(() =>
      executeInternalAuth(
        "logout",
        envelope(
          "logout",
          { session_token: token, csrf_token: b64("G") },
          clock,
          { jti: b64("K") },
        ),
        deps(store, clock),
      ),
    ).toThrow();
    const response = executeInternalAuth(
      "logout",
      envelope(
        "logout",
        { session_token: token, csrf_token: b64("F") },
        clock,
        { jti: b64("L") },
      ),
      deps(store, clock),
    );
    expect(response.userId).toBe("u1");
    expect(store.sessionsRows[0].revokedAt).not.toBeNull();
  });

  it("carries issued CSRF into rotation, rejects mismatch before revoke, and validates the replacement", () => {
    const clock = new Clock();
    const store = new Store();
    const dependencies = deps(store, clock);
    const originalSession = b64("E");
    const originalCsrf = b64("F");
    const issuedCsrf = b64("G");
    const mismatchedCsrf = b64("H");
    const replacementSession = b64("I");
    const replacementCsrf = b64("J");
    executeInternalAuth(
      "login_first_bind",
      envelope(
        "login_first_bind",
        {
          email: "agent@example.com",
          sub: "sub",
          email_verified: true,
          session_token: originalSession,
          csrf_token: originalCsrf,
        },
        clock,
        { jti: b64("K") },
      ),
      dependencies,
    );
    executeInternalAuth(
      "issue_csrf",
      envelope(
        "issue_csrf",
        {
          session_token: originalSession,
          csrf_token: originalCsrf,
          next_csrf_token: issuedCsrf,
        },
        clock,
        { jti: b64("L") },
      ),
      dependencies,
    );
    expect(issuedCsrf).not.toBe(replacementCsrf);
    expect(() =>
      executeInternalAuth(
        "rotate_session",
        envelope(
          "rotate_session",
          {
            session_token: originalSession,
            csrf_token: mismatchedCsrf,
            next_session_token: replacementSession,
            next_csrf_token: replacementCsrf,
          },
          clock,
          { jti: b64("M") },
        ),
        dependencies,
      ),
    ).toThrow();
    expect(store.sessionsRows[0].revokedAt).toBeNull();
    executeInternalAuth(
      "rotate_session",
      envelope(
        "rotate_session",
        {
          session_token: originalSession,
          csrf_token: issuedCsrf,
          next_session_token: replacementSession,
          next_csrf_token: replacementCsrf,
        },
        clock,
        { jti: b64("N") },
      ),
      dependencies,
    );
    expect(store.sessionsRows[0].revokedAt).not.toBeNull();
    expect(() =>
      executeInternalAuth(
        "validate_session",
        envelope(
          "validate_session",
          { session_token: originalSession },
          clock,
          { jti: b64("O") },
        ),
        dependencies,
      ),
    ).toThrow();
    expect(() =>
      executeInternalAuth(
        "logout",
        envelope(
          "logout",
          { session_token: replacementSession, csrf_token: issuedCsrf },
          clock,
          { jti: b64("P") },
        ),
        dependencies,
      ),
    ).toThrow();
    expect(
      executeInternalAuth(
        "validate_session",
        envelope(
          "validate_session",
          { session_token: replacementSession },
          clock,
          { jti: b64("Q") },
        ),
        dependencies,
      ).userId,
    ).toBe("u1");
    executeInternalAuth(
      "logout",
      envelope(
        "logout",
        { session_token: replacementSession, csrf_token: replacementCsrf },
        clock,
        { jti: b64("R") },
      ),
      dependencies,
    );
    expect(store.sessionsRows[1].revokedAt).not.toBeNull();
    expect(() =>
      executeInternalAuth(
        "logout",
        envelope(
          "logout",
          { session_token: replacementSession, csrf_token: replacementCsrf },
          clock,
          { jti: b64("S") },
        ),
        dependencies,
      ),
    ).toThrow();
  });
});
