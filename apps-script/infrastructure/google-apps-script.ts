import type { LockServiceAdapter } from "../core/lock";
import type { ScriptProperties } from "../core/config";
import type { Spreadsheet } from "../core/schema";

interface AppsScriptRuntime {
  SpreadsheetApp: { openById(id: string): Spreadsheet };
  PropertiesService: { getScriptProperties(): ScriptProperties };
  LockService: LockServiceAdapter;
  Utilities: { getUuid(): string };
  ContentService: {
    MimeType: { JSON: unknown };
    createTextOutput(content: string): {
      setMimeType(mimeType: unknown): unknown;
    };
  };
}

export function appsScriptRuntime(): AppsScriptRuntime {
  return globalThis as unknown as AppsScriptRuntime;
}
