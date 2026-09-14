export const SHEET_SCHEMA = {
  Users: [
    "user_id",
    "email",
    "full_name",
    "mobile_number",
    "role",
    "account_status",
    "created_at",
    "updated_at",
  ],
  Applications: [
    "application_id",
    "customer_full_name",
    "mobile_number",
    "email",
    "complete_address",
    "barangay",
    "city_municipality",
    "province",
    "landmark",
    "plan_id",
    "plan_name_snapshot",
    "monthly_price_snapshot",
    "agent_id",
    "processor_id",
    "current_status",
    "job_order_number",
    "submitted_at",
    "installed_at",
    "notes",
    "version",
    "created_at",
    "updated_at",
  ],
  Plans: [
    "plan_id",
    "plan_name",
    "monthly_price",
    "speed_mbps",
    "plan_status",
    "created_at",
    "updated_at",
  ],
  Status_History: [
    "history_id",
    "application_id",
    "from_status",
    "to_status",
    "notes",
    "job_order_number",
    "actor_user_id",
    "request_id",
    "occurred_at",
  ],
  Attachments: [
    "attachment_id",
    "application_id",
    "id_type",
    "side",
    "drive_file_id",
    "original_filename",
    "mime_type",
    "size_bytes",
    "uploaded_by_user_id",
    "created_at",
    "deleted_at",
  ],
  Activity_Logs: [
    "log_id",
    "actor_user_id",
    "action",
    "entity_type",
    "entity_id",
    "request_id",
    "metadata_json",
    "occurred_at",
  ],
  Settings: [
    "setting_key",
    "setting_value",
    "updated_by_user_id",
    "updated_at",
  ],
} as const;

export type SheetName = keyof typeof SHEET_SCHEMA;

export const SHEET_NAMES = Object.keys(SHEET_SCHEMA) as SheetName[];

export class SchemaConflictError extends Error {
  constructor(sheetName: string) {
    super(`The ${sheetName} header does not match the canonical schema.`);
    this.name = "SchemaConflictError";
  }
}

export interface SheetRange {
  getValues(): unknown[][];
  setValues(values: readonly (readonly unknown[])[]): void;
}

export interface SpreadsheetSheet {
  getLastRow(): number;
  getLastColumn(): number;
  getRange(
    row: number,
    column: number,
    rows: number,
    columns: number,
  ): SheetRange;
  appendRow(values: readonly unknown[]): void;
}

export interface Spreadsheet {
  getSheetByName(name: string): SpreadsheetSheet | null;
  insertSheet(name: string): SpreadsheetSheet;
}

function sameHeaders(
  actual: readonly unknown[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

/** Creates missing tabs and validates, but never overwrites, a non-empty header. */
export function initializeSchema(spreadsheet: Spreadsheet): void {
  for (const sheetName of SHEET_NAMES) {
    const expectedHeaders = SHEET_SCHEMA[sheetName];
    const sheet =
      spreadsheet.getSheetByName(sheetName) ??
      spreadsheet.insertSheet(sheetName);

    if (sheet.getLastRow() === 0) {
      sheet
        .getRange(1, 1, 1, expectedHeaders.length)
        .setValues([expectedHeaders]);
      continue;
    }

    const actualHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    if (!sameHeaders(actualHeaders, expectedHeaders)) {
      throw new SchemaConflictError(sheetName);
    }
  }
}
