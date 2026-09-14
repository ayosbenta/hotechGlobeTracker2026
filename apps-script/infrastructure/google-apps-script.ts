import type { LockServiceAdapter } from "../core/lock";
import type { ScriptProperties } from "../core/config";
import type { Spreadsheet } from "../core/schema";

interface AppsScriptRuntime {
  SpreadsheetApp: { openById(id: string): Spreadsheet };
  PropertiesService: { getScriptProperties(): ScriptProperties };
  LockService: LockServiceAdapter;
  Utilities: {
    getUuid(): string;
    getRandomBytes(length: number): number[];
    computeDigest(
      algorithm: unknown,
      value: string,
      charset: unknown,
    ): number[];
    computeHmacSha256Signature(value: string, secret: string): number[];
    base64EncodeWebSafe(bytes: number[]): string;
    DigestAlgorithm: { SHA_256: unknown };
    Charset: { UTF_8: unknown };
  };
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
