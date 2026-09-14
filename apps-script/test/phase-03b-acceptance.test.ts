import { describe, expect, it } from "vitest";
import {
  assertPhase03BAcceptanceIsolation,
  cleanupPhase03BAcceptanceData,
  createAcceptanceTokenSource,
  sanitizeAcceptanceSummary,
} from "../core/phase-03b-acceptance";
import { createOpaqueToken, isCanonicalBase64Url } from "../core/auth-crypto";
import { migrateAuthSchema } from "../core/auth-schema";
import { initializeSchema } from "../core/schema";
import { MemorySpreadsheet } from "./helpers";

class Properties {
  values = new Map<string, string>();
  getProperty(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setProperty(key: string, value: string): void {
    this.values.set(key, value);
  }
}
function runtime() {
  const spreadsheet = new MemorySpreadsheet();
  initializeSchema(spreadsheet);
  const properties = new Properties();
  properties.setProperty("SPREADSHEET_ID", "abcdefghijklmnopqrstuvwxyz_123");
  properties.setProperty(
    "ACCEPTANCE_TEST_SPREADSHEET_ID",
    "abcdefghijklmnopqrstuvwxyz_123",
  );
  properties.setProperty("ACCEPTANCE_TEST_MODE", "true");
  migrateAuthSchema(spreadsheet, properties);
  const settings = spreadsheet.getSheetByName("Settings")!;
  settings.appendRow(["ENVIRONMENT", "isolated-test", "", ""]);
  for (const [key, value] of Object.entries({
    INTERNAL_AUDIENCE: "hotech-globe-tracker.apps-script.nonprod",
    INTERNAL_HMAC_ACTIVE_KEY_ID: "nonprod-k1",
    INTERNAL_HMAC_KEYS_JSON:
      '{"nonprod-k1":{"secret":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","status":"active"}}',
    SESSION_TOKEN_PEPPER: "a".repeat(32),
    CSRF_TOKEN_PEPPER: "b".repeat(32),
    INTERNAL_CLOCK_SKEW_SECONDS: "30",
    INTERNAL_ASSERTION_MAX_TTL_SECONDS: "60",
    SESSION_IDLE_TTL_SECONDS: "1800",
    SESSION_ABSOLUTE_TTL_SECONDS: "28800",
    SESSION_TOUCH_INTERVAL_SECONDS: "300",
  }))
    properties.setProperty(key, value);
  return {
    properties,
    spreadsheet,
    cryptoUtilities: {
      computeDigest: () => Array(32).fill(0),
      computeHmacSha256Signature: () => Array(32).fill(0),
      DigestAlgorithm: { SHA_256: "sha" },
      Charset: { UTF_8: "utf" },
    },
  };
}
describe("Phase 03B acceptance isolation", () => {
  it("returns and logs only the approved sanitized summary shape", () => {
    const summary = sanitizeAcceptanceSummary({
      ok: false,
      suite: "phase-03b",
      passed: 1,
      failed: 1,
      cleanup: false,
      checks: [
        {
          name: "safe_check",
          ok: false,
          safeCode: "CHECK_FAILED",
          token: "must-not-survive",
        } as unknown as { name: string; ok: boolean; safeCode: string },
      ],
      sessionToken: "must-not-survive",
    } as unknown as Parameters<typeof sanitizeAcceptanceSummary>[0]);
    expect(Object.keys(summary).sort()).toEqual([
      "checks",
      "cleanup",
      "failed",
      "ok",
      "passed",
      "suite",
    ]);
    expect(Object.keys(summary.checks[0]).sort()).toEqual([
      "name",
      "ok",
      "safeCode",
    ]);
    expect(JSON.stringify(summary)).not.toContain("must-not-survive");
  });
  it("uses distinct canonical 32-byte editor-suite-only test vectors", () => {
    const source = createAcceptanceTokenSource();
    const first = createOpaqueToken(source);
    const second = createOpaqueToken(source);
    expect(first).not.toBe(second);
    expect(isCanonicalBase64Url(first, 32)).toBe(true);
    expect(isCanonicalBase64Url(second, 32)).toBe(true);
    for (const invalid of ["AA=", "AA", "A".repeat(42), "A".repeat(44)])
      expect(isCanonicalBase64Url(invalid, 32)).toBe(false);
  });
  it("fails closed when an isolation guard is missing or a production origin is configured", () => {
    const value = runtime();
    assertPhase03BAcceptanceIsolation(value);
    value.properties.setProperty(
      "PRODUCTION_ORIGIN",
      "https://production.example",
    );
    expect(() => assertPhase03BAcceptanceIsolation(value)).toThrow(
      "isolation guard",
    );
  });
  it("cleans only exact reserved-prefix rows and preserves headers plus near-matches", () => {
    const value = runtime();
    const users = value.spreadsheet.getSheetByName("Users")!;
    users.appendRow(["__phase03b_test__user_001"]);
    for (const preserved of [
      "phase03b_test",
      "user_phase03b_test",
      "__phase03b_test",
      "phase03b_test__",
    ])
      users.appendRow([preserved]);
    const sessions = value.spreadsheet.getSheetByName("Sessions")!;
    sessions.appendRow(["__phase03b_test__session_001"]);
    sessions.appendRow(["real-session"]);
    const replays = value.spreadsheet.getSheetByName("InternalRequestReplays")!;
    replays.appendRow(["__phase03b_test__replay_001"]);
    replays.appendRow(["real-replay"]);
    const audits = value.spreadsheet.getSheetByName("Activity_Logs")!;
    audits.appendRow(["__phase03b_test__audit_001"]);
    audits.appendRow(["real-audit"]);
    expect(cleanupPhase03BAcceptanceData(value)).toBe(true);
    expect(users.rows.map((row) => row[0])).toEqual([
      "user_id",
      "phase03b_test",
      "user_phase03b_test",
      "__phase03b_test",
      "phase03b_test__",
    ]);
    expect(sessions.rows.map((row) => row[0])).toEqual([
      "session_id",
      "real-session",
    ]);
    expect(replays.rows.map((row) => row[0])).toEqual([
      "replay_id",
      "real-replay",
    ]);
    expect(audits.rows.map((row) => row[0])).toEqual(["log_id", "real-audit"]);
  });
});
