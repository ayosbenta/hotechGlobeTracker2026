import type { AuthStore, AuthUser, StoredSession } from "./auth-domain";
import type { Spreadsheet } from "./schema";
import {
  INTERNAL_REQUEST_REPLAYS_HEADERS,
  SESSIONS_HEADERS,
  USERS_AUTH_COLUMNS,
} from "./auth-schema";
import {
  lockoutUntilFor,
  type CredentialRow,
  type PasswordCredentialStore,
} from "./password-auth";

function cells(sheet: {
  getLastRow(): number;
  getLastColumn(): number;
  getRange(
    row: number,
    column: number,
    rows: number,
    columns: number,
  ): { getValues(): unknown[][] };
}): unknown[][] {
  return sheet.getLastRow() < 2
    ? []
    : sheet
        .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
        .getValues();
}
function iso(value: unknown): string {
  return typeof value === "string"
    ? value
    : value instanceof Date
      ? value.toISOString()
      : "";
}
function nullable(value: unknown): string | null {
  const result = iso(value);
  return result === "" ? null : result;
}
function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}
function bool(value: unknown): boolean {
  return typeof value === "boolean"
    ? value
    : String(value).trim().toUpperCase() === "TRUE";
}
/** Header-addressed persistence adapter; no raw authentication material is ever written. */
export class SheetAuthStore implements AuthStore, PasswordCredentialStore {
  constructor(private readonly spreadsheet: Spreadsheet) {}
  private sheet(name: string) {
    const sheet = this.spreadsheet.getSheetByName(name);
    if (sheet === null) throw new Error("Required auth sheet is unavailable.");
    return sheet;
  }
  users(): AuthUser[] {
    return cells(this.sheet("Users")).map((row, index) => ({
      userId: String(row[0]),
      email: String(row[1]),
      accountStatus: String(row[5]),
      role: String(row[4]),
      providerSubject: row[9] ? String(row[9]) : null,
      sessionVersion: number(row[13]),
      row: index + 2,
    }));
  }
  sessions(): StoredSession[] {
    return cells(this.sheet("Sessions")).map((row, index) => ({
      sessionId: String(row[0]),
      sessionTokenHash: String(row[1]),
      userId: String(row[2]),
      issuedAt: iso(row[3]),
      lastSeenAt: iso(row[4]),
      idleExpiresAt: iso(row[5]),
      absoluteExpiresAt: iso(row[6]),
      revokedAt: nullable(row[7]),
      sessionVersion: number(row[8]),
      csrfSecretHash: String(row[9]),
      row: index + 2,
    }));
  }
  replayExists(hash: string): boolean {
    return cells(this.sheet("InternalRequestReplays")).some(
      (row) => row[1] === hash,
    );
  }
  appendReplay(value: {
    replayId: string;
    hash: string;
    purpose: string;
    digest: string;
    issuedAt: string;
    expiresAt: string;
    sessionId: string;
    userId: string;
  }): void {
    this.sheet("InternalRequestReplays").appendRow([
      value.replayId,
      value.hash,
      value.purpose,
      value.digest,
      value.issuedAt,
      value.expiresAt,
      new Date().toISOString(),
      value.sessionId,
      value.userId,
    ]);
  }
  appendAudit(input: {
    actorUserId: string;
    action: string;
    entityId: string;
    requestId: string;
    metadata: Record<string, string>;
  }): void {
    this.sheet("Activity_Logs").appendRow([
      `${input.requestId}-${input.action}`,
      input.actorUserId,
      input.action,
      "AuthSession",
      input.entityId,
      input.requestId,
      JSON.stringify(input.metadata),
      new Date().toISOString(),
    ]);
  }
  updateUser(
    user: AuthUser,
    changes: Partial<Pick<AuthUser, "providerSubject">>,
  ): void {
    if (changes.providerSubject !== undefined)
      this.sheet("Users")
        .getRange(user.row, 10, 1, 1)
        .setValues([[changes.providerSubject]]);
  }
  /**
   * Credentials tab (auth-schema-v2.ts), 1-indexed columns:
   * 1 credential_id, 2 user_id, 3 login_identifier_normalized, 4 password_hash,
   * 5 password_algo, 6 password_algo_params, 7 must_change_password,
   * 8 password_changed_at, 9 failed_login_count, 10 locked_until,
   * 11 created_at, 12 updated_at.
   */
  private credentials(): CredentialRow[] {
    return cells(this.sheet("Credentials")).map((row, index) => ({
      credentialId: String(row[0]),
      userId: String(row[1]),
      loginIdentifierNormalized: String(row[2]),
      passwordHash: String(row[3]),
      passwordAlgo: String(row[4]),
      passwordAlgoParams: String(row[5] ?? ""),
      mustChangePassword: bool(row[6]),
      passwordChangedAt: nullable(row[7]),
      failedLoginCount: number(row[8] ?? 0),
      lockedUntil: nullable(row[9]),
      row: index + 2,
    }));
  }
  private credentialById(credentialId: string): CredentialRow | null {
    return (
      this.credentials().find((item) => item.credentialId === credentialId) ??
      null
    );
  }
  private setCredentialCell(row: number, column: number, value: unknown): void {
    this.sheet("Credentials")
      .getRange(row, column, 1, 1)
      .setValues([[value]]);
    // updated_at, kept in step with every credential mutation.
    this.sheet("Credentials")
      .getRange(row, 12, 1, 1)
      .setValues([[new Date().toISOString()]]);
  }
  getCredentialByIdentifier(identifier: string): CredentialRow | null {
    return (
      this.credentials().find(
        (item) => item.loginIdentifierNormalized === identifier,
      ) ?? null
    );
  }
  getUserById(userId: string): AuthUser | null {
    return this.users().find((item) => item.userId === userId) ?? null;
  }
  /**
   * Increments the consecutive-failure counter and applies the persistent
   * lockout once the policy threshold is crossed (PASSWORD_AUTH_IMPACT_PLAN.md
   * §8). The threshold itself lives in password-auth.ts; this adapter applies
   * it rather than defining its own.
   */
  recordFailedAuthAttempt(credentialId: string): void {
    const credential = this.credentialById(credentialId);
    if (credential === null) return;
    const failed = credential.failedLoginCount + 1;
    this.setCredentialCell(credential.row, 9, failed);
    const lockedUntil = lockoutUntilFor(failed, new Date());
    if (lockedUntil !== null)
      this.setCredentialCell(credential.row, 10, lockedUntil);
  }
  clearFailedAuthAttempts(credentialId: string): void {
    const credential = this.credentialById(credentialId);
    if (credential === null) return;
    this.setCredentialCell(credential.row, 9, 0);
  }
  clearLockout(credentialId: string): void {
    const credential = this.credentialById(credentialId);
    if (credential === null) return;
    this.setCredentialCell(credential.row, 10, "");
  }
  appendSession(value: Omit<StoredSession, "row">): void {
    this.sheet("Sessions").appendRow([
      value.sessionId,
      value.sessionTokenHash,
      value.userId,
      value.issuedAt,
      value.lastSeenAt,
      value.idleExpiresAt,
      value.absoluteExpiresAt,
      value.revokedAt ?? "",
      value.sessionVersion,
      value.csrfSecretHash,
    ]);
  }
  updateSession(session: StoredSession, changes: Partial<StoredSession>): void {
    const next = { ...session, ...changes };
    this.sheet("Sessions")
      .getRange(session.row, 1, 1, SESSIONS_HEADERS.length)
      .setValues([
        [
          next.sessionId,
          next.sessionTokenHash,
          next.userId,
          next.issuedAt,
          next.lastSeenAt,
          next.idleExpiresAt,
          next.absoluteExpiresAt,
          next.revokedAt ?? "",
          next.sessionVersion,
          next.csrfSecretHash,
        ],
      ]);
  }
  /** Owner/editor-only reconciliation evidence scan; it never replays a mutation. */
  reconcileIncompleteAudits(): number {
    const rows = cells(this.sheet("Activity_Logs"));
    const intents = rows.filter(
      (row) => typeof row[2] === "string" && String(row[2]).endsWith("_INTENT"),
    );
    const completions = new Set(
      rows
        .filter(
          (row) =>
            typeof row[2] === "string" && String(row[2]).endsWith("_COMPLETE"),
        )
        .map(
          (row) =>
            `${row[5]}:${String(row[2]).replace("_COMPLETE", "_INTENT")}`,
        ),
    );
    let repaired = 0;
    for (const row of intents) {
      const key = `${row[5]}:${row[2]}`;
      if (!completions.has(key)) {
        this.appendAudit({
          actorUserId: String(row[1]),
          action: String(row[2]).replace("_INTENT", "_COMPLETE"),
          entityId: String(row[4]),
          requestId: String(row[5]),
          metadata: { purpose: "reconciliation", result: "observed" },
        });
        repaired += 1;
      }
    }
    return repaired;
  }

  /** Deletes only reserved acceptance rows, from bottom to top. */
  deleteAcceptanceRows(prefix: string): boolean {
    const targets: Array<{ name: string; idColumn: number }> = [
      { name: "Users", idColumn: 1 },
      { name: "Sessions", idColumn: 1 },
      { name: "InternalRequestReplays", idColumn: 1 },
      { name: "Activity_Logs", idColumn: 1 },
    ];
    for (const target of targets) {
      const sheet = this.sheet(target.name);
      for (let row = sheet.getLastRow(); row >= 2; row -= 1) {
        const value = sheet
          .getRange(row, target.idColumn, 1, 1)
          .getValues()[0][0];
        if (typeof value === "string" && value.startsWith(prefix))
          sheet.deleteRow(row);
      }
    }
    return !targets.some((target) =>
      cells(this.sheet(target.name)).some((row) =>
        String(row[target.idColumn - 1] ?? "").startsWith(prefix),
      ),
    );
  }
}
export const AUTH_STORE_HEADERS = {
  sessions: SESSIONS_HEADERS,
  replays: INTERNAL_REQUEST_REPLAYS_HEADERS,
  userSuffix: USERS_AUTH_COLUMNS,
};
