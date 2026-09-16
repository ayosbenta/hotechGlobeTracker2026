import { describe, expect, it } from "vitest";

import {
  BootstrapAdminError,
  bootstrapAdminUser,
} from "../core/admin-bootstrap";
import { USERS_AUTH_COLUMNS } from "../core/auth-schema";
import { SHEET_SCHEMA } from "../core/schema";
import { SheetAuthStore } from "../core/sheet-auth-store";
import { FixedClock, MemorySheet, MemorySpreadsheet } from "./helpers";

const input = {
  email: " Admin@Example.com ",
  fullName: "Test Admin",
  mobileNumber: "+63 900 000 0000",
};

function usersSheet(headers: readonly string[]): MemorySheet {
  const sheet = new MemorySheet();
  sheet.appendRow(headers);
  return sheet;
}

const migratedHeaders = [...SHEET_SCHEMA.Users, ...USERS_AUTH_COLUMNS];

describe("bootstrapAdminUser", () => {
  it("appends an Active Admin row with values placed by header", () => {
    const sheet = usersSheet(migratedHeaders);
    expect(bootstrapAdminUser(sheet, input, new FixedClock())).toBe("created");

    const row = sheet.rows[1];
    const value = (name: string) => row[migratedHeaders.indexOf(name)];
    expect(value("user_id")).toBe("admin-001");
    expect(value("email")).toBe("admin@example.com");
    expect(value("full_name")).toBe("Test Admin");
    expect(value("role")).toBe("Admin");
    expect(value("account_status")).toBe("Active");
    expect(value("created_at")).toBe("2026-09-14T00:00:00.000Z");
    expect(value("provider_subject")).toBe("");
    expect(value("session_version")).toBe(1);
    expect(row).toHaveLength(migratedHeaders.length);
  });

  it("produces a row the auth store reads as an unbound Active Admin", () => {
    const sheet = usersSheet(migratedHeaders);
    bootstrapAdminUser(sheet, input, new FixedClock());
    const spreadsheet = new MemorySpreadsheet();
    spreadsheet.sheets.set("Users", sheet);

    const [user] = new SheetAuthStore(spreadsheet).users();
    expect(user).toMatchObject({
      userId: "admin-001",
      role: "Admin",
      accountStatus: "Active",
      providerSubject: null,
      sessionVersion: 1,
    });
  });

  it("works on an un-migrated Users sheet (base columns only)", () => {
    const sheet = usersSheet(SHEET_SCHEMA.Users);
    bootstrapAdminUser(sheet, input, new FixedClock());
    expect(sheet.rows[1]).toHaveLength(SHEET_SCHEMA.Users.length);
  });

  it("is idempotent when admin-001 already exists", () => {
    const sheet = usersSheet(migratedHeaders);
    bootstrapAdminUser(sheet, input, new FixedClock());
    expect(bootstrapAdminUser(sheet, input, new FixedClock())).toBe(
      "already_exists",
    );
    expect(sheet.rows).toHaveLength(2);
  });

  it("does not add a duplicate when another row already uses the email", () => {
    const sheet = usersSheet(migratedHeaders);
    sheet.appendRow(["user-xyz", "admin@example.com", "Existing"]);
    expect(bootstrapAdminUser(sheet, input, new FixedClock())).toBe(
      "already_exists",
    );
    expect(sheet.rows).toHaveLength(2);
  });

  it.each([
    [{ ...input, email: "not-an-email" }],
    [{ ...input, fullName: "  " }],
  ])("rejects invalid input %j", (bad) => {
    const sheet = usersSheet(migratedHeaders);
    expect(() => bootstrapAdminUser(sheet, bad, new FixedClock())).toThrow(
      BootstrapAdminError,
    );
    expect(sheet.rows).toHaveLength(1);
  });

  it("refuses a sheet without the expected headers", () => {
    expect(() =>
      bootstrapAdminUser(new MemorySheet(), input, new FixedClock()),
    ).toThrow(BootstrapAdminError);
    expect(() =>
      bootstrapAdminUser(
        usersSheet(["email", "user_id"]),
        input,
        new FixedClock(),
      ),
    ).toThrow(BootstrapAdminError);
  });
});
