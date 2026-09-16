import { loadAuthConfig } from "./auth-config";
import { appsScriptCrypto } from "./apps-script-auth-crypto";
import {
  createOpaqueToken,
  encodeBase64Url,
  isCanonicalBase64Url,
  type SecureRandom,
  signingInput,
} from "./auth-crypto";
import { executeInternalAuth, type Operation } from "./auth-domain";
import { canonicalPayload } from "./auth-envelope";
import { AUTH_SCHEMA_VERSION } from "./auth-schema";
import type { MutableScriptProperties } from "./auth-schema";
import type { Clock, UuidGenerator } from "./contracts";
import type { Spreadsheet } from "./schema";
import { SheetAuthStore } from "./sheet-auth-store";

/** Exact reserved synthetic identifier prefix; matching is startsWith only. */
export const PHASE_03B_TEST_PREFIX = "__phase03b_test__";
export interface AcceptanceRuntime {
  properties: MutableScriptProperties;
  spreadsheet: Spreadsheet;
  cryptoUtilities: Parameters<typeof appsScriptCrypto>[0];
}
export interface AcceptanceCheck {
  name: string;
  ok: boolean;
  safeCode: string;
}
export interface AcceptanceSummary {
  ok: boolean;
  suite: "phase-03b";
  passed: number;
  failed: number;
  checks: AcceptanceCheck[];
  cleanup: boolean;
}
/** Returns the only shape permitted in the editor execution log. */
export function sanitizeAcceptanceSummary(
  summary: AcceptanceSummary,
): AcceptanceSummary {
  return {
    ok: summary.ok,
    suite: "phase-03b",
    passed: summary.passed,
    failed: summary.failed,
    cleanup: summary.cleanup,
    checks: summary.checks.map((check) => ({
      name: check.name,
      ok: check.ok,
      safeCode: check.safeCode,
    })),
  };
}
class AcceptanceClock implements Clock {
  constructor(private value = new Date("2026-01-01T00:00:00.000Z")) {}
  now(): Date {
    return new Date(this.value);
  }
  advance(seconds: number): void {
    this.value = new Date(this.value.getTime() + seconds * 1000);
  }
}
class AcceptanceIds implements UuidGenerator {
  private count = 0;
  generate(): string {
    this.count += 1;
    return `${PHASE_03B_TEST_PREFIX}_${this.count}`;
  }
}
/** Editor-suite-only deterministic vectors; never used by internal operations. */
class DeterministicAcceptanceTokenSource implements SecureRandom {
  private value = 0;
  bytes(length: number): Uint8Array {
    if (length !== 32) throw new Error("Acceptance vector length is invalid.");
    this.value += 1;
    return new Uint8Array(length).fill(this.value);
  }
  base64Url(bytes: Uint8Array): string {
    return encodeBase64Url(bytes);
  }
}
/** Exposed for editor-suite tests only; no public or internal operation imports it. */
export function createAcceptanceTokenSource(): SecureRandom {
  return new DeterministicAcceptanceTokenSource();
}
function safeFailure(): never {
  throw new Error("Phase 03B acceptance isolation guard failed.");
}
function settingValue(spreadsheet: Spreadsheet, key: string): string | null {
  const sheet = spreadsheet.getSheetByName("Settings");
  if (sheet === null || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const match = rows.find((row) => row[0] === key);
  return match === undefined ? null : String(match[1]);
}
/** Guard shared by both editor-only acceptance functions. */
export function assertPhase03BAcceptanceIsolation(
  runtime: AcceptanceRuntime,
): void {
  const properties = runtime.properties;
  const sheetId = properties.getProperty("SPREADSHEET_ID");
  if (
    properties.getProperty("ACCEPTANCE_TEST_MODE") !== "true" ||
    !sheetId ||
    properties.getProperty("ACCEPTANCE_TEST_SPREADSHEET_ID") !== sheetId ||
    properties.getProperty("AUTH_SCHEMA_VERSION") !== AUTH_SCHEMA_VERSION ||
    settingValue(runtime.spreadsheet, "ENVIRONMENT") !== "isolated-test" ||
    (properties.getProperty("ALLOWED_ORIGINS") ?? "").trim() !== "" ||
    [
      "PRODUCTION_ORIGIN",
      "PRODUCTION_DOMAIN",
      "VERCEL_URL",
      "PUBLIC_APP_ORIGIN",
    ].some((key) => (properties.getProperty(key) ?? "").trim() !== "")
  )
    safeFailure();
  const config = loadAuthConfig(properties);
  if (!config.audience.endsWith(".nonprod")) safeFailure();
}
function envelope(
  operation: Operation,
  payload: Record<string, unknown>,
  jti: string,
  clock: Clock,
  runtime: AcceptanceRuntime,
): Record<string, unknown> {
  const config = loadAuthConfig(runtime.properties);
  const crypto = appsScriptCrypto(runtime.cryptoUtilities);
  const routes: Record<Operation, string> = {
    login_first_bind: "/internal/v1/auth/login-first-bind",
    login_password: "/internal/v1/auth/login-password",
    validate_session: "/internal/v1/auth/session/validate",
    rotate_session: "/internal/v1/auth/session/rotate",
    issue_csrf: "/internal/v1/auth/csrf/issue",
    logout: "/internal/v1/auth/logout",
    revoke_session: "/internal/v1/auth/session/revoke",
  };
  const issuedAt = clock.now().toISOString();
  const expiresAt = new Date(clock.now().getTime() + 60000).toISOString();
  const bodyDigest = crypto.sha256(canonicalPayload(payload));
  const key = config.keys.get(config.activeKeyId);
  if (key === undefined) safeFailure();
  const signature = crypto.hmacSha256(
    key.secret,
    signingInput({
      keyId: config.activeKeyId,
      audience: config.audience,
      issuedAt,
      expiresAt,
      jti,
      method: "POST",
      path: routes[operation],
      bodyDigest,
    }),
  );
  return {
    version: "v1",
    key_id: config.activeKeyId,
    audience: config.audience,
    issued_at: issuedAt,
    expires_at: expiresAt,
    jti,
    method: "POST",
    path: routes[operation],
    body_digest: bodyDigest,
    signature,
    payload,
  };
}
function check(
  checks: AcceptanceCheck[],
  name: string,
  work: () => void,
  failureCode = "CHECK_FAILED",
): void {
  try {
    work();
    checks.push({ name, ok: true, safeCode: "PASS" });
  } catch {
    checks.push({ name, ok: false, safeCode: failureCode });
  }
}
function mustDeny(work: () => unknown): void {
  let denied = false;
  try {
    work();
  } catch {
    denied = true;
  }
  if (!denied) throw new Error("Expected denial.");
}
/** Runs only against isolated, prefix-scoped synthetic data and always cleans it up. */
export function runPhase03BAcceptanceSuite(
  runtime: AcceptanceRuntime,
): AcceptanceSummary {
  assertPhase03BAcceptanceIsolation(runtime);
  const checks: AcceptanceCheck[] = [];
  let cleanup = false;
  const clock = new AcceptanceClock();
  const ids = new AcceptanceIds();
  const config = loadAuthConfig(runtime.properties);
  const crypto = appsScriptCrypto(runtime.cryptoUtilities);
  const random = createAcceptanceTokenSource();
  const store = new SheetAuthStore(runtime.spreadsheet);
  const deps = {
    config,
    crypto,
    clock,
    ids,
    store,
    lock: { run: <T>(work: () => T) => work() },
  };
  const nextToken = () => createOpaqueToken(random);
  try {
    const users = runtime.spreadsheet.getSheetByName("Users");
    if (users === null) safeFailure();
    users.appendRow([
      `${PHASE_03B_TEST_PREFIX}_user`,
      `${PHASE_03B_TEST_PREFIX}@example.invalid`,
      "Acceptance",
      "",
      "Agent",
      "Active",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      1,
      0,
      "",
    ]);
    const sessionToken = nextToken();
    const csrf = nextToken();
    let currentCsrf = csrf;
    const firstJti = nextToken();
    const login = envelope(
      "login_first_bind",
      {
        email: `${PHASE_03B_TEST_PREFIX}@example.invalid`,
        sub: `${PHASE_03B_TEST_PREFIX}_subject`,
        email_verified: true,
        session_token: sessionToken,
        csrf_token: csrf,
      },
      firstJti,
      clock,
      runtime,
    );
    check(checks, "valid_canonical_hmac_envelope", () => {
      if (!isCanonicalBase64Url(firstJti, 32)) throw new Error();
      executeInternalAuth("login_first_bind", login, deps);
    });
    check(checks, "malformed_noncanonical_base64url_rejection", () =>
      mustDeny(() =>
        executeInternalAuth(
          "validate_session",
          {
            ...envelope(
              "validate_session",
              { session_token: sessionToken },
              nextToken(),
              clock,
              runtime,
            ),
            jti: "AA=",
          },
          deps,
        ),
      ),
    );
    check(checks, "wrong_audience", () =>
      mustDeny(() =>
        executeInternalAuth(
          "validate_session",
          {
            ...envelope(
              "validate_session",
              { session_token: sessionToken },
              nextToken(),
              clock,
              runtime,
            ),
            audience: "wrong",
          },
          deps,
        ),
      ),
    );
    check(checks, "replay_rejection", () =>
      mustDeny(() => executeInternalAuth("login_first_bind", login, deps)),
    );
    check(checks, "session_hash_only_storage", () => {
      const row = store.sessions()[0];
      if (
        !row ||
        row.sessionTokenHash === sessionToken ||
        row.csrfSecretHash === csrf
      )
        throw new Error();
    });
    check(checks, "session_validation_and_touch_throttle", () => {
      const before = store.sessions()[0].lastSeenAt;
      executeInternalAuth(
        "validate_session",
        envelope(
          "validate_session",
          { session_token: sessionToken },
          nextToken(),
          clock,
          runtime,
        ),
        deps,
      );
      if (store.sessions()[0].lastSeenAt !== before) throw new Error();
      clock.advance(300);
      executeInternalAuth(
        "validate_session",
        envelope(
          "validate_session",
          { session_token: sessionToken },
          nextToken(),
          clock,
          runtime,
        ),
        deps,
      );
      if (store.sessions()[0].lastSeenAt === before) throw new Error();
    });
    check(checks, "csrf_success_and_rotation", () => {
      const next = nextToken();
      executeInternalAuth(
        "issue_csrf",
        envelope(
          "issue_csrf",
          {
            session_token: sessionToken,
            csrf_token: csrf,
            next_csrf_token: next,
          },
          nextToken(),
          clock,
          runtime,
        ),
        deps,
      );
      currentCsrf = next;
      mustDeny(() =>
        executeInternalAuth(
          "logout",
          envelope(
            "logout",
            { session_token: sessionToken, csrf_token: csrf },
            nextToken(),
            clock,
            runtime,
          ),
          deps,
        ),
      );
    });
    check(
      checks,
      "session_rotation_and_logout",
      () => {
        const nextSession = nextToken();
        const replacementCsrf = nextToken();
        const mismatchedCsrf = nextToken();
        mustDeny(() =>
          executeInternalAuth(
            "rotate_session",
            envelope(
              "rotate_session",
              {
                session_token: sessionToken,
                csrf_token: mismatchedCsrf,
                next_session_token: nextSession,
                next_csrf_token: replacementCsrf,
              },
              nextToken(),
              clock,
              runtime,
            ),
            deps,
          ),
        );
        if (store.sessions()[0].revokedAt !== null) throw new Error();
        executeInternalAuth(
          "rotate_session",
          envelope(
            "rotate_session",
            {
              session_token: sessionToken,
              csrf_token: currentCsrf,
              next_session_token: nextSession,
              next_csrf_token: replacementCsrf,
            },
            nextToken(),
            clock,
            runtime,
          ),
          deps,
        );
        executeInternalAuth(
          "validate_session",
          envelope(
            "validate_session",
            { session_token: nextSession },
            nextToken(),
            clock,
            runtime,
          ),
          deps,
        );
        mustDeny(() =>
          executeInternalAuth(
            "validate_session",
            envelope(
              "validate_session",
              { session_token: sessionToken },
              nextToken(),
              clock,
              runtime,
            ),
            deps,
          ),
        );
        mustDeny(() =>
          executeInternalAuth(
            "logout",
            envelope(
              "logout",
              { session_token: nextSession, csrf_token: currentCsrf },
              nextToken(),
              clock,
              runtime,
            ),
            deps,
          ),
        );
        executeInternalAuth(
          "logout",
          envelope(
            "logout",
            { session_token: nextSession, csrf_token: replacementCsrf },
            nextToken(),
            clock,
            runtime,
          ),
          deps,
        );
        if (store.sessions().some((item) => item.revokedAt === null))
          throw new Error();
        mustDeny(() =>
          executeInternalAuth(
            "logout",
            envelope(
              "logout",
              { session_token: nextSession, csrf_token: replacementCsrf },
              nextToken(),
              clock,
              runtime,
            ),
            deps,
          ),
        );
      },
      "ROTATE_REQUEST",
    );
    check(checks, "audit_metadata_sanitized", () => {
      const logs = runtime.spreadsheet.getSheetByName("Activity_Logs");
      if (logs === null) throw new Error();
      const values = logs
        .getRange(
          2,
          1,
          Math.max(0, logs.getLastRow() - 1),
          logs.getLastColumn(),
        )
        .getValues()
        .flat()
        .join(" ");
      if (
        values.includes(sessionToken) ||
        values.includes(csrf) ||
        values.includes(firstJti)
      )
        throw new Error();
    });
    check(checks, "reconciliation_discovery", () => {
      store.appendAudit({
        actorUserId: `${PHASE_03B_TEST_PREFIX}_user`,
        action: "TEST_INTENT",
        entityId: `${PHASE_03B_TEST_PREFIX}_entity`,
        requestId: `${PHASE_03B_TEST_PREFIX}_audit`,
        metadata: { purpose: "test", result: "intent" },
      });
      if (store.reconcileIncompleteAudits() < 1) throw new Error();
    });
  } finally {
    try {
      cleanup = store.deleteAcceptanceRows(PHASE_03B_TEST_PREFIX);
    } catch {
      cleanup = false;
    }
  }
  const passed = checks.filter((item) => item.ok).length;
  return {
    ok: passed === checks.length && cleanup,
    suite: "phase-03b",
    passed,
    failed: checks.length - passed,
    checks,
    cleanup,
  };
}
export function cleanupPhase03BAcceptanceData(
  runtime: AcceptanceRuntime,
): boolean {
  assertPhase03BAcceptanceIsolation(runtime);
  return new SheetAuthStore(runtime.spreadsheet).deleteAcceptanceRows(
    PHASE_03B_TEST_PREFIX,
  );
}
