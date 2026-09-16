import { describe, expect, it } from "vitest";

import {
  isLockedOut,
  lockoutUntilFor,
  MAX_FAILED_LOGIN_ATTEMPTS,
  normalizeLoginIdentifier,
  PasswordAuthDomain,
  type CredentialRow,
  type PasswordAuthUser,
  type PasswordCredentialStore,
} from "../core/password-auth";
import { SheetAuthStore } from "../core/sheet-auth-store";
import { MemorySpreadsheet } from "./helpers";

const NOW = new Date("2026-09-16T12:00:00.000Z");

function credential(overrides: Partial<CredentialRow> = {}): CredentialRow {
  return {
    credentialId: "cred-1",
    userId: "user-1",
    loginIdentifierNormalized: "agent@example.com",
    passwordHash: "hash",
    passwordAlgo: "argon2id",
    passwordAlgoParams: "",
    mustChangePassword: false,
    passwordChangedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    row: 2,
    ...overrides,
  };
}

/** Records which bookkeeping calls the policy made, so tests can assert them. */
class FakeStore implements PasswordCredentialStore {
  readonly calls: string[] = [];
  constructor(
    private readonly credentialRow: CredentialRow | null,
    private readonly user: PasswordAuthUser | null = {
      userId: "user-1",
      accountStatus: "Active",
      role: "Agent",
    },
  ) {}
  getCredentialByIdentifier(identifier: string): CredentialRow | null {
    return this.credentialRow !== null &&
      this.credentialRow.loginIdentifierNormalized === identifier
      ? this.credentialRow
      : null;
  }
  getUserById(): PasswordAuthUser | null {
    return this.user;
  }
  recordFailedAuthAttempt(credentialId: string): void {
    this.calls.push("fail:" + credentialId);
  }
  clearFailedAuthAttempts(credentialId: string): void {
    this.calls.push("clearFailed:" + credentialId);
  }
  clearLockout(credentialId: string): void {
    this.calls.push("clearLock:" + credentialId);
  }
}

function decide(
  store: PasswordCredentialStore,
  overrides: Partial<{
    lockHeld: boolean;
    identifier: string;
    passwordVerified: boolean;
  }> = {},
) {
  return new PasswordAuthDomain(store).decidePasswordLogin({
    lockHeld: true,
    identifier: "agent@example.com",
    passwordVerified: true,
    now: NOW,
    isSupportedRole: (role) =>
      role === "Admin" || role === "Agent" || role === "Processor",
    ...overrides,
  });
}

describe("normalizeLoginIdentifier", () => {
  it("lowercases and trims a usable identifier", () => {
    expect(normalizeLoginIdentifier("  Agent@Example.COM ")).toBe(
      "agent@example.com",
    );
  });

  it("rejects empty and whitespace-bearing identifiers", () => {
    expect(normalizeLoginIdentifier("")).toBeNull();
    expect(normalizeLoginIdentifier("   ")).toBeNull();
    expect(normalizeLoginIdentifier("two words")).toBeNull();
  });
});

describe("lockout helpers", () => {
  it("treats a future locked_until as locked and a past one as clear", () => {
    expect(
      isLockedOut(credential({ lockedUntil: "2026-09-16T12:30:00.000Z" }), NOW),
    ).toBe(true);
    expect(
      isLockedOut(credential({ lockedUntil: "2026-09-16T11:30:00.000Z" }), NOW),
    ).toBe(false);
  });

  it("treats a missing or unparseable locked_until as not locked", () => {
    expect(isLockedOut(credential({ lockedUntil: null }), NOW)).toBe(false);
    expect(isLockedOut(credential({ lockedUntil: "" }), NOW)).toBe(false);
    expect(isLockedOut(credential({ lockedUntil: "not-a-date" }), NOW)).toBe(
      false,
    );
  });

  it("locks only once the failure threshold is reached", () => {
    expect(lockoutUntilFor(MAX_FAILED_LOGIN_ATTEMPTS - 1, NOW)).toBeNull();
    expect(lockoutUntilFor(MAX_FAILED_LOGIN_ATTEMPTS, NOW)).toBe(
      "2026-09-16T12:15:00.000Z",
    );
  });
});

describe("PasswordAuthDomain.decidePasswordLogin", () => {
  it("requires the script lock before touching anything", () => {
    const store = new FakeStore(credential());
    expect(decide(store, { lockHeld: false }).decision).toBe("lock_required");
    expect(store.calls).toEqual([]);
  });

  it("rejects an unusable identifier without a store lookup", () => {
    const store = new FakeStore(credential());
    expect(decide(store, { identifier: "  " }).decision).toBe(
      "invalid_identifier",
    );
    expect(store.calls).toEqual([]);
  });

  it("reports an unknown identifier without recording a failure", () => {
    const store = new FakeStore(null);
    expect(decide(store).decision).toBe("unknown_identifier");
    expect(store.calls).toEqual([]);
  });

  it("refuses a locked account before checking the password", () => {
    const store = new FakeStore(
      credential({ lockedUntil: "2026-09-16T12:30:00.000Z" }),
    );
    // Even a correct password must not extend or bypass an active lockout.
    expect(decide(store, { passwordVerified: true }).decision).toBe(
      "account_locked",
    );
    expect(store.calls).toEqual([]);
  });

  it("records a failure when the BFF reports a password mismatch", () => {
    const store = new FakeStore(credential());
    expect(decide(store, { passwordVerified: false }).decision).toBe(
      "password_mismatch",
    );
    expect(store.calls).toEqual(["fail:cred-1"]);
  });

  it("denies a credential whose user row is missing", () => {
    const store = new FakeStore(credential(), null);
    expect(decide(store).decision).toBe("unknown_user");
    expect(store.calls).toEqual([]);
  });

  it("denies an inactive account", () => {
    const store = new FakeStore(credential(), {
      userId: "user-1",
      accountStatus: "Disabled",
      role: "Agent",
    });
    expect(decide(store).decision).toBe("account_inactive");
  });

  it("denies an unsupported role", () => {
    const store = new FakeStore(credential(), {
      userId: "user-1",
      accountStatus: "Active",
      role: "Auditor",
    });
    expect(decide(store).decision).toBe("unsupported_role");
  });

  it("allows a verified password and clears the failure counters", () => {
    const store = new FakeStore(credential({ failedLoginCount: 3 }));
    const outcome = decide(store);

    expect(outcome.decision).toBe("allow");
    expect(outcome.user?.userId).toBe("user-1");
    expect(store.calls).toEqual(["clearFailed:cred-1", "clearLock:cred-1"]);
  });

  it("signals a forced change instead of a plain allow", () => {
    const store = new FakeStore(credential({ mustChangePassword: true }));
    const outcome = decide(store);

    expect(outcome.decision).toBe("must_change_password");
    expect(store.calls).toEqual(["clearFailed:cred-1", "clearLock:cred-1"]);
  });
});

function spreadsheetWithCredential(
  overrides: Partial<{
    failedLoginCount: number;
    lockedUntil: string;
    mustChangePassword: boolean;
  }> = {},
): MemorySpreadsheet {
  const spreadsheet = new MemorySpreadsheet();

  const users = spreadsheet.insertSheet("Users");
  users.appendRow(Array.from({ length: 14 }, (_, index) => "h" + index));
  const userRow: unknown[] = Array.from({ length: 14 }, () => "");
  userRow[0] = "user-1";
  userRow[1] = "agent@example.com";
  userRow[4] = "Agent";
  userRow[5] = "Active";
  userRow[13] = 1;
  users.appendRow(userRow);

  const credentials = spreadsheet.insertSheet("Credentials");
  credentials.appendRow([
    "credential_id",
    "user_id",
    "login_identifier_normalized",
    "password_hash",
    "password_algo",
    "password_algo_params",
    "must_change_password",
    "password_changed_at",
    "failed_login_count",
    "locked_until",
    "created_at",
    "updated_at",
  ]);
  credentials.appendRow([
    "cred-1",
    "user-1",
    "agent@example.com",
    "stored-hash",
    "argon2id",
    "",
    overrides.mustChangePassword ?? false,
    "",
    overrides.failedLoginCount ?? 0,
    overrides.lockedUntil ?? "",
    "2026-09-16T00:00:00.000Z",
    "2026-09-16T00:00:00.000Z",
  ]);

  return spreadsheet;
}

describe("SheetAuthStore credential methods", () => {
  it("reads a credential row by normalized identifier", () => {
    const store = new SheetAuthStore(spreadsheetWithCredential());
    const found = store.getCredentialByIdentifier("agent@example.com");

    expect(found?.credentialId).toBe("cred-1");
    expect(found?.userId).toBe("user-1");
    expect(found?.passwordHash).toBe("stored-hash");
    expect(found?.mustChangePassword).toBe(false);
    expect(found?.row).toBe(2);
  });

  it("returns null for an identifier with no credential row", () => {
    const store = new SheetAuthStore(spreadsheetWithCredential());
    expect(store.getCredentialByIdentifier("nobody@example.com")).toBeNull();
  });

  it("reads a TRUE must_change_password written as a sheet string", () => {
    const spreadsheet = spreadsheetWithCredential();
    spreadsheet.getSheetByName("Credentials")?.setValue(2, 7, "TRUE");
    const store = new SheetAuthStore(spreadsheet);

    expect(
      store.getCredentialByIdentifier("agent@example.com")?.mustChangePassword,
    ).toBe(true);
  });

  it("looks a user up by id and returns null when absent", () => {
    const store = new SheetAuthStore(spreadsheetWithCredential());

    expect(store.getUserById("user-1")?.role).toBe("Agent");
    expect(store.getUserById("user-404")).toBeNull();
  });

  it("increments the failure counter without locking below the threshold", () => {
    const spreadsheet = spreadsheetWithCredential({ failedLoginCount: 1 });
    const store = new SheetAuthStore(spreadsheet);

    store.recordFailedAuthAttempt("cred-1");

    const after = store.getCredentialByIdentifier("agent@example.com");
    expect(after?.failedLoginCount).toBe(2);
    expect(after?.lockedUntil).toBeNull();
  });

  it("applies a persistent lockout once the threshold is crossed", () => {
    const spreadsheet = spreadsheetWithCredential({
      failedLoginCount: MAX_FAILED_LOGIN_ATTEMPTS - 1,
    });
    const store = new SheetAuthStore(spreadsheet);

    store.recordFailedAuthAttempt("cred-1");

    const after = store.getCredentialByIdentifier("agent@example.com");
    expect(after?.failedLoginCount).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(after?.lockedUntil).not.toBeNull();
    expect(after === null ? false : isLockedOut(after, new Date())).toBe(true);
  });

  it("clears the failure counter and the lockout independently", () => {
    const spreadsheet = spreadsheetWithCredential({
      failedLoginCount: 4,
      lockedUntil: "2099-01-01T00:00:00.000Z",
    });
    const store = new SheetAuthStore(spreadsheet);

    store.clearFailedAuthAttempts("cred-1");
    expect(
      store.getCredentialByIdentifier("agent@example.com")?.failedLoginCount,
    ).toBe(0);
    expect(
      store.getCredentialByIdentifier("agent@example.com")?.lockedUntil,
    ).toBe("2099-01-01T00:00:00.000Z");

    store.clearLockout("cred-1");
    expect(
      store.getCredentialByIdentifier("agent@example.com")?.lockedUntil,
    ).toBeNull();
  });

  it("ignores bookkeeping calls for an unknown credential id", () => {
    const store = new SheetAuthStore(spreadsheetWithCredential());

    expect(() => {
      store.recordFailedAuthAttempt("missing");
      store.clearFailedAuthAttempts("missing");
      store.clearLockout("missing");
    }).not.toThrow();
    expect(
      store.getCredentialByIdentifier("agent@example.com")?.failedLoginCount,
    ).toBe(0);
  });
});
