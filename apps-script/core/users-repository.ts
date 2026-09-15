import type { UserAccountStatus, UserRecord, UserRole } from "./contracts";
import type { SpreadsheetSheet } from "./schema";

const USER_ROLES: readonly UserRole[] = ["Admin", "Agent", "Processor"];
const USER_ACCOUNT_STATUSES: readonly UserAccountStatus[] = [
  "Active",
  "Inactive",
  "Locked",
];

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}

export function isUserAccountStatus(
  value: unknown,
): value is UserAccountStatus {
  return (
    typeof value === "string" &&
    (USER_ACCOUNT_STATUSES as readonly string[]).includes(value)
  );
}

function cells(sheet: SpreadsheetSheet): unknown[][] {
  return sheet.getLastRow() < 2
    ? []
    : sheet
        .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
        .getValues();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export interface UserRecordWithRow extends UserRecord {
  row: number;
}

function toRecord(row: unknown[], rowPosition: number): UserRecordWithRow {
  return {
    userId: text(row[0]),
    email: text(row[1]),
    fullName: text(row[2]),
    mobileNumber: text(row[3]),
    role: isUserRole(row[4]) ? row[4] : "Agent",
    accountStatus: isUserAccountStatus(row[5]) ? row[5] : "Inactive",
    createdAt: text(row[6]),
    updatedAt: text(row[7]),
    row: rowPosition,
  };
}

function stripRow(record: UserRecordWithRow): UserRecord {
  return {
    userId: record.userId,
    email: record.email,
    fullName: record.fullName,
    mobileNumber: record.mobileNumber,
    role: record.role,
    accountStatus: record.accountStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface UpdateUserChanges {
  fullName?: string;
  mobileNumber?: string;
  role?: UserRole;
  accountStatus?: UserAccountStatus;
  updatedAt: string;
}

export interface UsersListFilter {
  role?: UserRole;
  accountStatus?: UserAccountStatus;
}

/**
 * Header-addressed Users persistence adapter over the frozen `Users` sheet
 * (`user_id, email, full_name, mobile_number, role, account_status,
 * created_at, updated_at`). Never exposes raw Sheet row positions to callers
 * outside this module. This is a separate, read/patch-only repository from
 * `SheetAuthStore` (which owns the auth-suffix columns and session logic);
 * both address the same physical `Users` sheet but never overlap in the
 * columns they write.
 */
export class UsersRepository {
  constructor(private readonly sheet: SpreadsheetSheet) {}

  list(filter: UsersListFilter = {}): UserRecord[] {
    return cells(this.sheet)
      .map((row, index) => toRecord(row, index + 2))
      .filter(
        (record) => filter.role === undefined || record.role === filter.role,
      )
      .filter(
        (record) =>
          filter.accountStatus === undefined ||
          record.accountStatus === filter.accountStatus,
      )
      .map(stripRow);
  }

  findById(userId: string): UserRecordWithRow | null {
    const rows = cells(this.sheet);
    for (let index = 0; index < rows.length; index += 1) {
      const record = toRecord(rows[index], index + 2);
      if (record.userId === userId) return record;
    }
    return null;
  }

  /** Counts Active accounts with role=Admin, optionally excluding one userId (the row being changed). */
  countActiveAdmins(excludingUserId?: string): number {
    return cells(this.sheet)
      .map((row, index) => toRecord(row, index + 2))
      .filter((record) => record.userId !== excludingUserId)
      .filter(
        (record) =>
          record.role === "Admin" && record.accountStatus === "Active",
      ).length;
  }

  /** Caller must have already checked `updatedAt` against the client-supplied concurrency token. */
  update(existing: UserRecordWithRow, changes: UpdateUserChanges): UserRecord {
    const next: UserRecord = {
      userId: existing.userId,
      email: existing.email,
      fullName: changes.fullName ?? existing.fullName,
      mobileNumber: changes.mobileNumber ?? existing.mobileNumber,
      role: changes.role ?? existing.role,
      accountStatus: changes.accountStatus ?? existing.accountStatus,
      createdAt: existing.createdAt,
      updatedAt: changes.updatedAt,
    };
    this.sheet
      .getRange(existing.row, 1, 1, 8)
      .setValues([
        [
          next.userId,
          next.email,
          next.fullName,
          next.mobileNumber,
          next.role,
          next.accountStatus,
          next.createdAt,
          next.updatedAt,
        ],
      ]);
    return next;
  }
}
