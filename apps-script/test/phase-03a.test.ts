import { describe, expect, it } from "vitest";

import { loadAuthConfig } from "../core/auth-config";
import {
  constantTimeEquals,
  createOpaqueToken,
  hashSecret,
  verifyInternalRequest,
} from "../core/auth-crypto";
import {
  AUTH_SCHEMA_VERSION,
  AUTH_SCHEMA_VERSION_PROPERTY,
  INTERNAL_REQUEST_REPLAYS_HEADERS,
  migrateAuthSchema,
  SESSIONS_HEADERS,
  USERS_AUTH_COLUMNS,
} from "../core/auth-schema";
import { decideFirstProviderBind, normalizeEmail } from "../core/first-bind";
import {
  createSessionRecord,
  revokeSession,
  rotateSession,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  touchSession,
  validateSession,
} from "../core/session-lifecycle";
import { initializeSchema, SHEET_SCHEMA } from "../core/schema";
import { MemorySpreadsheet } from "./helpers";

class Properties {
  readonly values = new Map<string, string>();
  getProperty(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setProperty(key: string, value: string): void {
    this.values.set(key, value);
  }
}
class MutableClock {
  constructor(private value: Date) {}
  now(): Date {
    return new Date(this.value);
  }
  advance(seconds: number): void {
    this.value = new Date(this.value.getTime() + seconds * 1000);
  }
}

describe("Phase 03A auth schema migration", () => {
  it("preserves existing users and safely completes an idempotent append-only migration", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const users = spreadsheet.getSheetByName("Users");
    if (users === null) throw new Error("Users missing");
    users.appendRow([
      "u-1",
      "Agent@Example.com",
      "Agent",
      "09",
      "Agent",
      "Active",
      "created",
      "updated",
    ]);
    users.appendRow(["", "", "", "", "", "", "", ""]);
    const properties = new Properties();
    migrateAuthSchema(spreadsheet, properties);
    expect(users.rows[0]).toEqual([
      ...SHEET_SCHEMA.Users,
      ...USERS_AUTH_COLUMNS,
    ]);
    expect(users.rows[1]).toEqual([
      "u-1",
      "Agent@Example.com",
      "Agent",
      "09",
      "Agent",
      "Active",
      "created",
      "updated",
      "",
      "",
      "",
      "",
      "",
      1,
      0,
      "",
    ]);
    expect(users.rows[2]).toEqual([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(spreadsheet.getSheetByName("Sessions")?.rows[0]).toEqual(
      SESSIONS_HEADERS,
    );
    expect(
      spreadsheet.getSheetByName("InternalRequestReplays")?.rows[0],
    ).toEqual(INTERNAL_REQUEST_REPLAYS_HEADERS);
    expect(properties.getProperty(AUTH_SCHEMA_VERSION_PROPERTY)).toBe(
      AUTH_SCHEMA_VERSION,
    );
    migrateAuthSchema(spreadsheet, properties);
    expect(users.rows).toHaveLength(3);
  });

  it("fails before mutation for conflicting schemas and never advances the version", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const sessions = spreadsheet.insertSheet("Sessions");
    sessions.appendRow(["wrong"]);
    const properties = new Properties();
    expect(() => migrateAuthSchema(spreadsheet, properties)).toThrow();
    expect(spreadsheet.getSheetByName("Users")?.rows[0]).toEqual(
      SHEET_SCHEMA.Users,
    );
    expect(properties.getProperty(AUTH_SCHEMA_VERSION_PROPERTY)).toBeNull();
  });

  it("treats a completed version with missing headers as a hard safe failure", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const properties = new Properties();
    properties.setProperty(AUTH_SCHEMA_VERSION_PROPERTY, AUTH_SCHEMA_VERSION);
    expect(() => migrateAuthSchema(spreadsheet, properties)).toThrow();
    expect(spreadsheet.getSheetByName("Sessions")).toBeNull();
  });
});

describe("Phase 03A deterministic security primitives", () => {
  it("rejects unsafe auth configuration without revealing its secret", () => {
    const values: Record<string, string> = {
      SPREADSHEET_ID: "abcdefghijklmnopqrstuvwxyz_123",
      AUTH_SCHEMA_VERSION: "phase-03a-v1",
      INTERNAL_AUDIENCE: "hotech-globe-tracker.apps-script.nonprod",
      INTERNAL_HMAC_KEYS_JSON:
        '{"key-1":{"secret":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","status":"active"}}',
      INTERNAL_HMAC_ACTIVE_KEY_ID: "key-1",
      SESSION_TOKEN_PEPPER: "a".repeat(32),
      CSRF_TOKEN_PEPPER: "b".repeat(32),
      INTERNAL_CLOCK_SKEW_SECONDS: "30",
      INTERNAL_ASSERTION_MAX_TTL_SECONDS: "60",
      SESSION_IDLE_TTL_SECONDS: "1800",
      SESSION_ABSOLUTE_TTL_SECONDS: "28800",
      SESSION_TOUCH_INTERVAL_SECONDS: "300",
    };
    expect(
      loadAuthConfig({ getProperty: (key) => values[key] ?? null })
        .sessionIdleSeconds,
    ).toBe(1800);
    values.SESSION_IDLE_TTL_SECONDS = "1799";
    expect(() =>
      loadAuthConfig({ getProperty: (key) => values[key] ?? null }),
    ).toThrow("Server configuration is unavailable.");
  });

  it("uses injected crypto/random adapters and never requires raw values for persistence", () => {
    const random = {
      bytes: (length: number) => new Uint8Array(length).fill(7),
      base64Url: () => "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc",
    };
    const crypto = {
      sha256: (value: string) => `hash(${value})`,
      hmacSha256: (secret: string, value: string) => `sig(${secret}:${value})`,
    };
    expect(createOpaqueToken(random)).toBe(
      "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc",
    );
    expect(hashSecret(crypto, "pepper", "raw-token")).toBe(
      "sig(pepper:raw-token)",
    );
    const digest = "input";
    expect(
      verifyInternalRequest(crypto, "secret", digest, "sig(secret:input)"),
    ).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
  });

  it("enforces deterministic expiry, throttled touch, rotation, revocation, and version invalidation", () => {
    const clock = new MutableClock(new Date("2026-09-14T00:00:00.000Z"));
    const session = createSessionRecord(clock, {
      sessionId: "s1",
      userId: "u1",
      sessionVersion: 1,
    });
    expect(validateSession(session, 1, clock)).toBe("valid");
    clock.advance(299);
    expect(touchSession(session, 1, clock)).toEqual(session);
    clock.advance(1);
    const touched = touchSession(session, 1, clock);
    expect(touched.lastSeenAt).not.toBe(session.lastSeenAt);
    expect(validateSession(touched, 2, clock)).toBe("version_mismatch");
    const rotated = rotateSession(touched, { sessionId: "s2" }, clock);
    expect(rotated.revoked.revokedAt).not.toBeNull();
    expect(rotated.replacement.sessionId).toBe("s2");
    expect(
      validateSession(revokeSession(rotated.replacement, clock), 1, clock),
    ).toBe("revoked");
    const expiryClock = new MutableClock(new Date("2026-09-14T00:00:00.000Z"));
    const expiry = createSessionRecord(expiryClock, {
      sessionId: "s",
      userId: "u",
      sessionVersion: 1,
    });
    expiryClock.advance(SESSION_IDLE_SECONDS);
    expect(validateSession(expiry, 1, expiryClock)).toBe("expired");
    expect(SESSION_ABSOLUTE_SECONDS).toBe(28800);
  });

  it("allows first bind only under the lock for one exact normalized active email and unique subject", () => {
    const users = [
      {
        userId: "u1",
        email: "agent@example.com",
        accountStatus: "Active",
        providerSubject: null,
      },
    ];
    expect(normalizeEmail(" Agent@Example.com ")).toBe("agent@example.com");
    expect(
      decideFirstProviderBind({
        lockHeld: true,
        emailVerified: true,
        email: "Agent@Example.com",
        providerSubject: "sub-1",
        users,
      }),
    ).toBe("allow");
    expect(
      decideFirstProviderBind({
        lockHeld: false,
        emailVerified: true,
        email: "agent@example.com",
        providerSubject: "sub-1",
        users,
      }),
    ).toBe("lock_required");
    expect(
      decideFirstProviderBind({
        lockHeld: true,
        emailVerified: true,
        email: "agent@example.com",
        providerSubject: "sub-1",
        users: [...users, { ...users[0], userId: "u2" }],
      }),
    ).toBe("ambiguous_email");
    expect(
      decideFirstProviderBind({
        lockHeld: true,
        emailVerified: true,
        email: "other@example.com",
        providerSubject: "sub-1",
        users: [{ ...users[0], providerSubject: "sub-1" }],
      }),
    ).toBe("subject_already_bound");
  });
});
