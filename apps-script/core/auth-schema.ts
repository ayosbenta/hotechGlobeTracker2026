import type { ScriptProperties } from "./config";
import {
  SHEET_SCHEMA,
  SchemaConflictError,
  type Spreadsheet,
  type SpreadsheetSheet,
} from "./schema";

export const AUTH_SCHEMA_VERSION = "phase-03a-v1";
export const AUTH_SCHEMA_VERSION_PROPERTY = "AUTH_SCHEMA_VERSION";
export const USERS_AUTH_COLUMNS = [
  "auth_provider",
  "provider_subject",
  "email_verified_at",
  "last_login_at",
  "last_logout_at",
  "session_version",
  "failed_auth_count",
  "locked_until",
] as const;
export const SESSIONS_HEADERS = [
  "session_id",
  "session_token_hash",
  "user_id",
  "issued_at",
  "last_seen_at",
  "idle_expires_at",
  "absolute_expires_at",
  "revoked_at",
  "session_version",
  "csrf_secret_hash",
] as const;
export const INTERNAL_REQUEST_REPLAYS_HEADERS = [
  "replay_id",
  "jti_hash",
  "purpose",
  "request_digest",
  "issued_at",
  "expires_at",
  "consumed_at",
  "session_id",
  "user_id",
] as const;

export interface MutableScriptProperties extends ScriptProperties {
  setProperty(key: string, value: string): void;
}

function headers(sheet: SpreadsheetSheet): unknown[] {
  return sheet.getLastRow() === 0
    ? []
    : sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function requireExactOrEmpty(
  sheet: SpreadsheetSheet,
  expected: readonly string[],
  name: string,
): void {
  const actual = headers(sheet);
  if (
    actual.length !== 0 &&
    (actual.length !== expected.length ||
      actual.some((value, index) => value !== expected[index]))
  ) {
    throw new SchemaConflictError(name);
  }
  if (actual.length === 0)
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
}

function appendUsersSuffix(users: SpreadsheetSheet): void {
  const actual = headers(users);
  const frozenLength = 8;
  const expected = [...actual.slice(0, frozenLength), ...USERS_AUTH_COLUMNS];
  if (
    actual.length < frozenLength ||
    actual.length > expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new SchemaConflictError("Users");
  }
  if (actual.length < expected.length) {
    users
      .getRange(1, actual.length + 1, 1, expected.length - actual.length)
      .setValues([expected.slice(actual.length)]);
  }
}

function hasExpectedUsersHeaders(users: SpreadsheetSheet): boolean {
  const actual = headers(users);
  return (
    actual.length === 16 &&
    actual.every(
      (value, index) =>
        value === [...actual.slice(0, 8), ...USERS_AUTH_COLUMNS][index],
    )
  );
}

function hasExactHeaders(
  sheet: SpreadsheetSheet,
  expected: readonly string[],
): boolean {
  const actual = headers(sheet);
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function validateAuthPreflight(spreadsheet: Spreadsheet): void {
  for (const [name, expected] of Object.entries(SHEET_SCHEMA)) {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet === null || sheet.getLastRow() === 0)
      throw new SchemaConflictError(name);
    const actual = headers(sheet);
    if (
      name !== "Users" &&
      (actual.length !== expected.length ||
        actual.some((value, index) => value !== expected[index]))
    )
      throw new SchemaConflictError(name);
    if (
      name === "Users" &&
      (actual.length < expected.length ||
        actual
          .slice(0, expected.length)
          .some((value, index) => value !== expected[index]))
    )
      throw new SchemaConflictError(name);
  }
  const users = spreadsheet.getSheetByName("Users");
  if (users === null) throw new SchemaConflictError("Users");
  const userHeaders = headers(users);
  if (
    userHeaders.length < 8 ||
    userHeaders.length > 16 ||
    userHeaders.some(
      (value, index) =>
        value !== [...userHeaders.slice(0, 8), ...USERS_AUTH_COLUMNS][index],
    )
  )
    throw new SchemaConflictError("Users");
  for (const [name, expected] of [
    ["Sessions", SESSIONS_HEADERS],
    ["InternalRequestReplays", INTERNAL_REQUEST_REPLAYS_HEADERS],
  ] as const) {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet !== null) {
      const actual = headers(sheet);
      if (
        actual.length !== 0 &&
        (actual.length !== expected.length ||
          actual.some((value, index) => value !== expected[index]))
      )
        throw new SchemaConflictError(name);
    }
  }
}

function isNonEmptyUser(row: readonly unknown[]): boolean {
  return row
    .slice(0, 8)
    .some((value) => value !== "" && value !== null && value !== undefined);
}

function applyUserDefaults(users: SpreadsheetSheet): void {
  if (users.getLastRow() < 2) return;
  const values = users.getRange(2, 1, users.getLastRow() - 1, 16).getValues();
  const changed = values.map((row) => {
    const next = [...row];
    if (isNonEmptyUser(next)) {
      if (next[13] === "" || next[13] === null || next[13] === undefined)
        next[13] = 1;
      if (next[14] === "" || next[14] === null || next[14] === undefined)
        next[14] = 0;
    }
    return next;
  });
  users.getRange(2, 1, changed.length, 16).setValues(changed);
}

/** Append-only, owner-run Phase 03A migration. It intentionally has no rollback claim. */
export function migrateAuthSchema(
  spreadsheet: Spreadsheet,
  properties: MutableScriptProperties,
): void {
  const markedComplete = properties.getProperty(AUTH_SCHEMA_VERSION_PROPERTY);
  if (markedComplete !== null && markedComplete !== AUTH_SCHEMA_VERSION)
    throw new SchemaConflictError("AUTH_SCHEMA_VERSION");
  validateAuthPreflight(spreadsheet);
  if (markedComplete === AUTH_SCHEMA_VERSION) {
    const users = spreadsheet.getSheetByName("Users");
    const sessions = spreadsheet.getSheetByName("Sessions");
    const replays = spreadsheet.getSheetByName("InternalRequestReplays");
    if (
      users === null ||
      sessions === null ||
      replays === null ||
      !hasExpectedUsersHeaders(users) ||
      !hasExactHeaders(sessions, SESSIONS_HEADERS) ||
      !hasExactHeaders(replays, INTERNAL_REQUEST_REPLAYS_HEADERS)
    )
      throw new SchemaConflictError("AUTH_SCHEMA_VERSION");
    return;
  }

  const users = spreadsheet.getSheetByName("Users");
  if (users === null) throw new SchemaConflictError("Users");
  appendUsersSuffix(users);
  const sessions =
    spreadsheet.getSheetByName("Sessions") ??
    spreadsheet.insertSheet("Sessions");
  const replays =
    spreadsheet.getSheetByName("InternalRequestReplays") ??
    spreadsheet.insertSheet("InternalRequestReplays");
  requireExactOrEmpty(sessions, SESSIONS_HEADERS, "Sessions");
  requireExactOrEmpty(
    replays,
    INTERNAL_REQUEST_REPLAYS_HEADERS,
    "InternalRequestReplays",
  );
  applyUserDefaults(users);

  // Verify the completed state before declaring it complete.
  if (!hasExpectedUsersHeaders(users)) throw new SchemaConflictError("Users");
  requireExactOrEmpty(sessions, SESSIONS_HEADERS, "Sessions");
  requireExactOrEmpty(
    replays,
    INTERNAL_REQUEST_REPLAYS_HEADERS,
    "InternalRequestReplays",
  );
  properties.setProperty(AUTH_SCHEMA_VERSION_PROPERTY, AUTH_SCHEMA_VERSION);
}
