import type { Clock } from "./contracts";
import { normalizeEmail } from "./first-bind";
import type { SpreadsheetSheet } from "./schema";

export const BOOTSTRAP_ADMIN_USER_ID = "admin-001";

export interface BootstrapAdminInput {
  email: string;
  fullName: string;
  mobileNumber: string;
}

export type BootstrapAdminResult = "created" | "already_exists";

export class BootstrapAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapAdminError";
  }
}

/**
 * Appends the single Admin row the BFF password login signs in as
 * (login_first_bind matches on email, role "Admin", status "Active").
 * Idempotent: an existing admin-001 row or an existing row with the same
 * email is left untouched, since a duplicate email would make first-bind
 * ambiguous and deny the login. Values are written by header name so the
 * optional Phase 03A auth columns are honoured when present.
 */
export function bootstrapAdminUser(
  users: SpreadsheetSheet,
  input: BootstrapAdminInput,
  clock: Clock,
): BootstrapAdminResult {
  const email = normalizeEmail(input.email);
  if (email === null) throw new BootstrapAdminError("Admin email is invalid.");
  const fullName = input.fullName.trim();
  if (!fullName) throw new BootstrapAdminError("Admin full name is required.");

  const lastColumn = users.getLastColumn();
  if (users.getLastRow() < 1 || lastColumn < 1)
    throw new BootstrapAdminError("Users sheet has no header row.");
  const headers = users
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((value) => String(value));
  const column = (name: string) => headers.indexOf(name);
  if (column("user_id") !== 0 || column("email") !== 1)
    throw new BootstrapAdminError("Users sheet headers are unexpected.");

  const rows =
    users.getLastRow() < 2
      ? []
      : users.getRange(2, 1, users.getLastRow() - 1, lastColumn).getValues();
  const exists = rows.some(
    (row) =>
      String(row[0]) === BOOTSTRAP_ADMIN_USER_ID ||
      normalizeEmail(String(row[1])) === email,
  );
  if (exists) return "already_exists";

  const now = clock.now().toISOString();
  const values: Record<string, unknown> = {
    user_id: BOOTSTRAP_ADMIN_USER_ID,
    email,
    full_name: fullName,
    mobile_number: input.mobileNumber.trim(),
    role: "Admin",
    account_status: "Active",
    created_at: now,
    updated_at: now,
    session_version: 1,
    failed_auth_count: 0,
  };
  users.appendRow(headers.map((name) => values[name] ?? ""));
  return "created";
}
