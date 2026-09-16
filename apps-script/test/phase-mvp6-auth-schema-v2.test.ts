import { describe, expect, it } from "vitest";

import {
  AUTH_SCHEMA_VERSION_V2,
  AUTH_SCHEMA_VERSION_V2_PROPERTY,
  CREDENTIALS_HEADERS,
  migrateAuthSchemaV2,
} from "../core/auth-schema-v2";
import { initializeSchema } from "../core/schema";
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

describe("Password-auth schema migration (Credentials tab)", () => {
  it("creates the Credentials tab with exact headers and is idempotent", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const properties = new Properties();

    migrateAuthSchemaV2(spreadsheet, properties);

    const credentials = spreadsheet.getSheetByName("Credentials");
    expect(credentials?.rows[0]).toEqual(CREDENTIALS_HEADERS);
    expect(properties.getProperty(AUTH_SCHEMA_VERSION_V2_PROPERTY)).toBe(
      AUTH_SCHEMA_VERSION_V2,
    );

    migrateAuthSchemaV2(spreadsheet, properties);
    expect(credentials?.rows).toHaveLength(1);
  });

  it("does not touch Users/Sessions/InternalRequestReplays", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const usersBefore = spreadsheet.getSheetByName("Users")?.rows[0];
    const properties = new Properties();

    migrateAuthSchemaV2(spreadsheet, properties);

    expect(spreadsheet.getSheetByName("Users")?.rows[0]).toEqual(usersBefore);
    expect(spreadsheet.getSheetByName("Sessions")).toBeNull();
    expect(spreadsheet.getSheetByName("InternalRequestReplays")).toBeNull();
  });

  it("fails safely on a conflicting non-empty Credentials header without overwriting", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const credentials = spreadsheet.insertSheet("Credentials");
    credentials.appendRow(["wrong_header"]);
    const properties = new Properties();

    expect(() => migrateAuthSchemaV2(spreadsheet, properties)).toThrow();
    expect(credentials.rows[0]).toEqual(["wrong_header"]);
    expect(properties.getProperty(AUTH_SCHEMA_VERSION_V2_PROPERTY)).toBeNull();
  });

  it("treats a completed version with missing headers as a hard safe failure", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const properties = new Properties();
    properties.setProperty(
      AUTH_SCHEMA_VERSION_V2_PROPERTY,
      AUTH_SCHEMA_VERSION_V2,
    );

    expect(() => migrateAuthSchemaV2(spreadsheet, properties)).toThrow();
  });

  it("rejects a stale version marker that does not match the current schema version", () => {
    const spreadsheet = new MemorySpreadsheet();
    initializeSchema(spreadsheet);
    const properties = new Properties();
    properties.setProperty(AUTH_SCHEMA_VERSION_V2_PROPERTY, "stale-version");

    expect(() => migrateAuthSchemaV2(spreadsheet, properties)).toThrow();
  });
});
