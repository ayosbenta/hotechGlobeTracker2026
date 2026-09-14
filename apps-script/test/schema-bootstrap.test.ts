import { describe, expect, it } from "vitest";

import { appendActivityLog } from "../core/audit";
import {
  initializeSchema,
  SchemaConflictError,
  SHEET_NAMES,
  SHEET_SCHEMA,
} from "../core/schema";
import { FixedClock, MemorySpreadsheet, SequenceUuid } from "./helpers";

describe("schema bootstrap", () => {
  it("creates exactly the canonical headers without row-number identities", () => {
    const spreadsheet = new MemorySpreadsheet();

    initializeSchema(spreadsheet);

    expect([...spreadsheet.sheets.keys()]).toEqual(SHEET_NAMES);
    for (const sheetName of SHEET_NAMES) {
      expect(spreadsheet.getSheetByName(sheetName)?.rows[0]).toEqual(
        SHEET_SCHEMA[sheetName],
      );
    }
    expect(SHEET_SCHEMA.Applications).toContain("application_id");
    expect(SHEET_SCHEMA.Applications).not.toContain("row_number");
  });

  it("is idempotent when canonical headers already exist", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const users = spreadsheet.getSheetByName("Users");
    users?.appendRow(["u-1"]);

    initializeSchema(spreadsheet);

    expect(users?.rows).toHaveLength(2);
    expect(users?.rows[0]).toEqual(SHEET_SCHEMA.Users);
  });

  it("fails without overwriting a conflicting non-empty header", () => {
    const spreadsheet = new MemorySpreadsheet();
    const users = spreadsheet.insertSheet("Users");
    users.appendRow(["incorrect_header"]);

    expect(() => initializeSchema(spreadsheet)).toThrow(SchemaConflictError);
    expect(users.rows[0]).toEqual(["incorrect_header"]);
  });

  it("rejects an otherwise matching header with extra columns", () => {
    const spreadsheet = new MemorySpreadsheet();
    const users = spreadsheet.insertSheet("Users");
    users.appendRow([...SHEET_SCHEMA.Users, "unexpected_column"]);

    expect(() => initializeSchema(spreadsheet)).toThrow(SchemaConflictError);
    expect(users.rows[0]).toHaveLength(SHEET_SCHEMA.Users.length + 1);
  });

  it("appends the bootstrap audit record only after the schema exists", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const logs = spreadsheet.getSheetByName("Activity_Logs");
    if (logs === null) throw new Error("Expected Activity_Logs.");

    appendActivityLog(
      logs,
      {
        actorUserId: "SYSTEM_BOOTSTRAP",
        action: "SCHEMA_BOOTSTRAP",
        entityType: "Spreadsheet",
        entityId: "schema",
        requestId: "request-1",
        metadata: { source: "Apps Script editor" },
      },
      new FixedClock(),
      new SequenceUuid(),
    );

    expect(logs.rows[1]).toEqual([
      "uuid-1",
      "SYSTEM_BOOTSTRAP",
      "SCHEMA_BOOTSTRAP",
      "Spreadsheet",
      "schema",
      "request-1",
      '{"source":"Apps Script editor"}',
      "2026-09-14T00:00:00.000Z",
    ]);
  });
});
