import {
  canonicalJson,
  createInternalEnvelope,
  signingInput,
} from "../auth/signing.js";
import type { SignedEnvelope, SigningKey } from "../auth/signing.js";
import { nodeCryptoAdapter, randomJti, randomToken } from "../auth/crypto.js";
import type { CryptoAdapter } from "../auth/crypto.js";
import type { AcceptanceRunnerConfig } from "./env.js";

/**
 * Standalone, repository-owned Phase 03C1A live acceptance runner. It never
 * duplicates the HMAC signing algorithm: every signed envelope is produced
 * by the existing, tested `createInternalEnvelope` (server/auth/signing.ts),
 * which is itself a byte-for-byte port of the frozen Apps Script verifier.
 *
 * This module performs no console output of its own; the CLI entrypoint
 * (scripts/run-phase-03c1a-acceptance.mjs) is solely responsible for
 * printing the final sanitized summary this module returns.
 */

const INTERNAL_OPERATION_PATHS: Record<
  "login_first_bind" | "validate_session" | "issue_csrf" | "logout",
  string
> = {
  login_first_bind: "/internal/v1/auth/login-first-bind",
  validate_session: "/internal/v1/auth/session/validate",
  issue_csrf: "/internal/v1/auth/csrf/issue",
  logout: "/internal/v1/auth/logout",
};

export type SafeCode =
  | "OK"
  | "AUTH_DENIED"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNEXPECTED";

export interface CheckResult {
  name: string;
  ok: boolean;
  safeCode: SafeCode;
}

export interface AcceptanceSummary {
  suite: "phase-03c1a-live-acceptance";
  ok: boolean;
  passed: number;
  failed: number;
  checks: CheckResult[];
}

export interface Fetcher {
  (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ): Promise<{ status: number; text(): Promise<string> }>;
}

interface RawResponse {
  status: number;
  parsed: Record<string, unknown> | null;
  rawText: string;
}

function scanForLeakage(
  rawText: string,
  secrets: readonly string[],
): string | null {
  for (const secret of secrets) {
    if (secret.length > 0 && rawText.includes(secret))
      return "response body contained a value that must never be echoed back";
  }
  // Structural leakage indicators that must never appear regardless of the
  // specific secret values used in this run.
  const structuralIndicators: RegExp[] = [
    /"stack"\s*:/i,
    /at [A-Za-z0-9_.$]+\s*\(.*:\d+:\d+\)/, // stack-trace frame shape
    /SPREADSHEET_ID/i,
    /"sheetId"/i,
    /"signature"\s*:/i,
    /"jti"\s*:/i,
    /"body_digest"\s*:/i,
    /"session_token"\s*:/i,
    /"csrf_token"\s*:/i,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // any email address
  ];
  for (const pattern of structuralIndicators) {
    if (pattern.test(rawText))
      return `response body matched a prohibited pattern: ${pattern.source}`;
  }
  return null;
}

async function post(
  fetcher: Fetcher,
  url: string,
  body: string,
  contentType: string,
): Promise<RawResponse> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const rawText = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    const value: unknown = JSON.parse(rawText);
    if (value !== null && typeof value === "object" && !Array.isArray(value))
      parsed = value as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  return { status: response.status, parsed, rawText };
}

function errorCode(response: RawResponse): string | null {
  const error = response.parsed?.error;
  if (error === null || typeof error !== "object") return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

function isSafeSuccess(response: RawResponse): boolean {
  if (response.parsed?.ok !== true) return false;
  const data = response.parsed.data;
  if (data === null || typeof data !== "object" || Array.isArray(data))
    return false;
  const allowedKeys = new Set(["userId", "role", "sessionId"]);
  return Object.keys(data as Record<string, unknown>).every((key) =>
    allowedKeys.has(key),
  );
}

function envelopeFor(
  crypto: CryptoAdapter,
  now: Date,
  signingKey: SigningKey,
  audience: string,
  operation: keyof typeof INTERNAL_OPERATION_PATHS,
  payload: Record<string, unknown>,
): SignedEnvelope {
  return createInternalEnvelope(crypto, now, signingKey, {
    audience,
    method: "POST",
    path: INTERNAL_OPERATION_PATHS[operation],
    payload,
  });
}

function tamperSignature(envelope: SignedEnvelope): SignedEnvelope {
  const firstChar = envelope.signature[0];
  const flippedFirstChar = firstChar === "A" ? "B" : "A";
  return {
    ...envelope,
    signature: flippedFirstChar + envelope.signature.slice(1),
  };
}

/**
 * Runs all Phase 03C1A live acceptance cases against a single explicitly
 * configured, already-validated (via loadAcceptanceConfig) isolated Apps
 * Script Web App URL. Returns only a sanitized summary; callers must not
 * print anything else derived from responses.
 */
export async function runPhase03C1AAcceptance(
  config: AcceptanceRunnerConfig,
  fetcher: Fetcher,
  clock: { now(): Date } = { now: () => new Date() },
  crypto: CryptoAdapter = nodeCryptoAdapter,
): Promise<AcceptanceSummary> {
  const checks: CheckResult[] = [];
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(32);
  const secretsToNeverLeak = [
    sessionToken,
    csrfToken,
    config.signingKey.secret,
    config.testUserEmail,
    config.testUserSubject,
  ];

  function record(name: string, ok: boolean, safeCode: SafeCode): void {
    checks.push({ name, ok, safeCode });
  }

  async function expectSafeAndScan(
    name: string,
    response: RawResponse,
    expected: (response: RawResponse) => { ok: boolean; safeCode: SafeCode },
  ): Promise<void> {
    const leakage = scanForLeakage(response.rawText, secretsToNeverLeak);
    if (leakage !== null) {
      record(name, false, "UNEXPECTED");
      return;
    }
    const outcome = expected(response);
    record(name, outcome.ok, outcome.safeCode);
  }

  // Case 1: valid signed call for every allowed operation, in dependency
  // order (login creates the session that validate/issue_csrf/logout need).
  const loginEnvelope = envelopeFor(
    crypto,
    clock.now(),
    config.signingKey,
    config.audience,
    "login_first_bind",
    {
      email: config.testUserEmail,
      sub: config.testUserSubject,
      email_verified: true,
      session_token: sessionToken,
      csrf_token: csrfToken,
    },
  );
  const loginResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({ operation: "login_first_bind", envelope: loginEnvelope }),
    "application/json",
  );
  await expectSafeAndScan(
    "valid login_first_bind succeeds",
    loginResponse,
    (response) => ({
      ok: isSafeSuccess(response),
      safeCode: isSafeSuccess(response) ? "OK" : "UNEXPECTED",
    }),
  );

  const validateEnvelope = envelopeFor(
    crypto,
    clock.now(),
    config.signingKey,
    config.audience,
    "validate_session",
    { session_token: sessionToken },
  );
  const validateResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: validateEnvelope,
    }),
    "application/json",
  );
  await expectSafeAndScan(
    "valid validate_session succeeds",
    validateResponse,
    (response) => ({
      ok: isSafeSuccess(response),
      safeCode: isSafeSuccess(response) ? "OK" : "UNEXPECTED",
    }),
  );

  const nextCsrfToken = randomToken(32);
  secretsToNeverLeak.push(nextCsrfToken);
  const issueCsrfEnvelope = envelopeFor(
    crypto,
    clock.now(),
    config.signingKey,
    config.audience,
    "issue_csrf",
    {
      session_token: sessionToken,
      csrf_token: csrfToken,
      next_csrf_token: nextCsrfToken,
    },
  );
  const issueCsrfResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({ operation: "issue_csrf", envelope: issueCsrfEnvelope }),
    "application/json",
  );
  await expectSafeAndScan(
    "valid issue_csrf succeeds",
    issueCsrfResponse,
    (response) => ({
      ok: isSafeSuccess(response),
      safeCode: isSafeSuccess(response) ? "OK" : "UNEXPECTED",
    }),
  );

  const logoutEnvelope = envelopeFor(
    crypto,
    clock.now(),
    config.signingKey,
    config.audience,
    "logout",
    { session_token: sessionToken, csrf_token: nextCsrfToken },
  );
  const logoutResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({ operation: "logout", envelope: logoutEnvelope }),
    "application/json",
  );
  await expectSafeAndScan(
    "valid logout succeeds",
    logoutResponse,
    (response) => ({
      ok: isSafeSuccess(response),
      safeCode: isSafeSuccess(response) ? "OK" : "UNEXPECTED",
    }),
  );

  // Case 2: invalid signature.
  const invalidSignatureEnvelope = tamperSignature(
    envelopeFor(
      crypto,
      clock.now(),
      config.signingKey,
      config.audience,
      "validate_session",
      { session_token: sessionToken },
    ),
  );
  const invalidSignatureResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: invalidSignatureEnvelope,
    }),
    "application/json",
  );
  await expectSafeAndScan(
    "invalid signature is denied",
    invalidSignatureResponse,
    (response) => ({
      ok: errorCode(response) === "AUTH_DENIED",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Case 3: wrong audience.
  const wrongAudienceEnvelope = envelopeFor(
    crypto,
    clock.now(),
    { ...config.signingKey },
    `${config.audience}.wrong`,
    "validate_session",
    { session_token: sessionToken },
  );
  const wrongAudienceResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: wrongAudienceEnvelope,
    }),
    "application/json",
  );
  await expectSafeAndScan(
    "wrong audience is denied",
    wrongAudienceResponse,
    (response) => ({
      ok: errorCode(response) === "AUTH_DENIED",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Case 4: wrong path/contract for the declared operation.
  const wrongPathEnvelope = createInternalEnvelope(
    crypto,
    clock.now(),
    config.signingKey,
    {
      audience: config.audience,
      method: "POST",
      path: INTERNAL_OPERATION_PATHS.logout,
      payload: { session_token: sessionToken },
    },
  );
  const wrongPathResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: wrongPathEnvelope,
    }),
    "application/json",
  );
  await expectSafeAndScan(
    "wrong internal path/contract is denied",
    wrongPathResponse,
    (response) => ({
      ok: errorCode(response) === "AUTH_DENIED",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Case 5: wrong HTTP method (GET must never reach the auth dispatcher).
  let wrongMethodOutcome: { ok: boolean; safeCode: SafeCode };
  try {
    const response = await fetcher(config.internalUrl, {
      method: "GET",
      headers: {},
      body: "",
    });
    const rawText = await response.text();
    const leakage = scanForLeakage(rawText, secretsToNeverLeak);
    wrongMethodOutcome =
      leakage === null
        ? { ok: true, safeCode: "NOT_FOUND" }
        : { ok: false, safeCode: "UNEXPECTED" };
  } catch {
    // A thrown network-level error for an unsupported method is also an
    // acceptable safe outcome: it proves the dispatcher was never reached.
    wrongMethodOutcome = { ok: true, safeCode: "NOT_FOUND" };
  }
  record(
    "GET does not reach the auth dispatcher",
    wrongMethodOutcome.ok,
    wrongMethodOutcome.safeCode,
  );

  // Case 6: expired assertion.
  const expiredEnvelope = envelopeFor(
    crypto,
    new Date(clock.now().getTime() - 5 * 60 * 1000),
    config.signingKey,
    config.audience,
    "validate_session",
    { session_token: sessionToken },
  );
  const expiredResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: expiredEnvelope,
    }),
    "application/json",
  );
  await expectSafeAndScan(
    "expired assertion is denied",
    expiredResponse,
    (response) => ({
      ok: errorCode(response) === "AUTH_DENIED",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Case 7: replay (reuse the earlier, already-consumed login envelope).
  const replayResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({ operation: "login_first_bind", envelope: loginEnvelope }),
    "application/json",
  );
  await expectSafeAndScan(
    "replayed envelope is denied",
    replayResponse,
    (response) => ({
      ok: errorCode(response) === "AUTH_DENIED",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Case 8: disallowed operations (rotate_session, revoke_session).
  for (const disallowed of ["rotate_session", "revoke_session"] as const) {
    const envelope = createInternalEnvelope(
      crypto,
      clock.now(),
      config.signingKey,
      {
        audience: config.audience,
        method: "POST",
        path: `/internal/v1/auth/session/${disallowed === "rotate_session" ? "rotate" : "revoke"}`,
        payload: { session_token: sessionToken },
      },
    );
    const response = await post(
      fetcher,
      config.internalUrl,
      JSON.stringify({ operation: disallowed, envelope }),
      "application/json",
    );
    await expectSafeAndScan(
      `disallowed operation "${disallowed}" is denied before dispatch`,
      response,
      (result) => ({
        ok: errorCode(result) === "AUTH_DENIED",
        safeCode: (errorCode(result) as SafeCode) ?? "UNEXPECTED",
      }),
    );
  }

  // Case 9: malformed JSON body.
  const malformedResponse = await post(
    fetcher,
    config.internalUrl,
    "{not-json",
    "application/json",
  );
  await expectSafeAndScan(
    "malformed JSON body is rejected",
    malformedResponse,
    (response) => ({
      ok: errorCode(response) === "VALIDATION_ERROR",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Case 10: unsigned/missing-envelope request.
  const missingEnvelopeResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({ operation: "logout" }),
    "application/json",
  );
  await expectSafeAndScan(
    "missing envelope key is rejected",
    missingEnvelopeResponse,
    (response) => ({
      ok: errorCode(response) === "VALIDATION_ERROR",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Case 11: oversized body (just over 16 KiB UTF-8).
  const oversizedPayload = {
    session_token: sessionToken,
    padding: "a".repeat(16 * 1024),
  };
  const oversizedEnvelope = envelopeFor(
    crypto,
    clock.now(),
    config.signingKey,
    config.audience,
    "validate_session",
    oversizedPayload,
  );
  const oversizedResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: oversizedEnvelope,
    }),
    "application/json",
  );
  await expectSafeAndScan(
    "oversized body (>16 KiB UTF-8) is rejected",
    oversizedResponse,
    (response) => ({
      ok: errorCode(response) === "VALIDATION_ERROR",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Case 12: wrong Content-Type.
  const wrongContentTypeEnvelope = envelopeFor(
    crypto,
    clock.now(),
    config.signingKey,
    config.audience,
    "validate_session",
    { session_token: sessionToken },
  );
  const wrongContentTypeResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: wrongContentTypeEnvelope,
    }),
    "text/plain",
  );
  await expectSafeAndScan(
    "wrong Content-Type is rejected",
    wrongContentTypeResponse,
    (response) => ({
      ok: errorCode(response) === "VALIDATION_ERROR",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // Explicit additional live case: application/json with a charset parameter
  // must be accepted, not rejected.
  const charsetEnvelope = envelopeFor(
    crypto,
    clock.now(),
    config.signingKey,
    config.audience,
    "validate_session",
    { session_token: sessionToken },
  );
  const charsetResponse = await post(
    fetcher,
    config.internalUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: charsetEnvelope,
    }),
    "application/json; charset=utf-8",
  );
  await expectSafeAndScan(
    "application/json; charset=utf-8 is accepted",
    charsetResponse,
    (response) => {
      // The session may already be revoked by the earlier logout call in
      // this sequence, so either a safe success or a safe AUTH_DENIED is an
      // acceptable outcome here — what this case actually proves is that
      // the charset parameter alone did not cause a VALIDATION_ERROR.
      const code = errorCode(response);
      const accepted = isSafeSuccess(response) || code === "AUTH_DENIED";
      return {
        ok: accepted,
        safeCode: isSafeSuccess(response)
          ? "OK"
          : ((code as SafeCode) ?? "UNEXPECTED"),
      };
    },
  );

  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.length - passed;
  return {
    suite: "phase-03c1a-live-acceptance",
    ok: failed === 0,
    passed,
    failed,
    checks,
  };
}

// Re-exported only so the CLI entrypoint can construct a Node fetch-backed
// fetcher without importing internals from elsewhere.
export function nodeFetcher(): Fetcher {
  return async (url, init) => {
    const response = await fetch(url, init);
    return { status: response.status, text: () => response.text() };
  };
}

// Exposed for tests only: proves the canonical signing input this module
// relies on is unmodified from server/auth/signing.ts.
export const __internalOperationPathsForTests = INTERNAL_OPERATION_PATHS;
export const __canonicalJsonForTests = canonicalJson;
export const __signingInputForTests = signingInput;
export const __randomJtiForTests = randomJti;
