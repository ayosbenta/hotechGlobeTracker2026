import type { MutableScriptProperties } from "./auth-schema";
import {
  SchemaConflictError,
  type Spreadsheet,
  type SpreadsheetSheet,
} from "./schema";

export const AUTH_SCHEMA_VERSION_V2 = "phase-mvp6-password-v1";
export const AUTH_SCHEMA_VERSION_V2_PROPERTY = "AUTH_SCHEMA_VERSION_V2";
export const CREDENTIALS_HEADERS = [
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
] as const;

function headers(sheet: SpreadsheetSheet): unknown[] {
  return sheet.getLastRow() === 0
    ? []
    : sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
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

/**
 * Append-only migration adding the Credentials tab for password authentication.
 * Never edits Users/Sessions/InternalRequestReplays from auth-schema.ts (Phase 03A),
 * matching this project's append-only-per-migration convention (D-050).
 */
export function migrateAuthSchemaV2(
  spreadsheet: Spreadsheet,
  properties: MutableScriptProperties,
): void {
  const markedComplete = properties.getProperty(
    AUTH_SCHEMA_VERSION_V2_PROPERTY,
  );
  if (markedComplete !== null && markedComplete !== AUTH_SCHEMA_VERSION_V2)
    throw new SchemaConflictError("AUTH_SCHEMA_VERSION_V2");

  const existing = spreadsheet.getSheetByName("Credentials");
  if (existing !== null) {
    const actual = headers(existing);
    if (
      actual.length !== 0 &&
      (actual.length !== CREDENTIALS_HEADERS.length ||
        actual.some((value, index) => value !== CREDENTIALS_HEADERS[index]))
    )
      throw new SchemaConflictError("Credentials");
  }

  if (markedComplete === AUTH_SCHEMA_VERSION_V2) {
    const credentials = spreadsheet.getSheetByName("Credentials");
    if (
      credentials === null ||
      !hasExactHeaders(credentials, CREDENTIALS_HEADERS)
    )
      throw new SchemaConflictError("AUTH_SCHEMA_VERSION_V2");
    return;
  }

  const credentials = existing ?? spreadsheet.insertSheet("Credentials");
  requireExactOrEmpty(credentials, CREDENTIALS_HEADERS, "Credentials");

  // Verify the completed state before declaring it complete.
  if (!hasExactHeaders(credentials, CREDENTIALS_HEADERS))
    throw new SchemaConflictError("Credentials");
  properties.setProperty(
    AUTH_SCHEMA_VERSION_V2_PROPERTY,
    AUTH_SCHEMA_VERSION_V2,
  );
}
