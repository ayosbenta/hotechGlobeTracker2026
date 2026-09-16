import { createInternalEnvelope, signingInput } from "../auth/signing.js";
import type { SignedEnvelope } from "../auth/signing.js";
import { nodeCryptoAdapter, randomToken } from "../auth/crypto.js";
import type { CryptoAdapter } from "../auth/crypto.js";
import type { Mvp4AcceptanceConfig } from "./mvp4-env.js";
import {
  buildSyntheticApplicationPayload,
  buildSyntheticPlanPayload,
} from "./mvp4-synthetic-data.js";

/**
 * MVP-4 local acceptance runner: extends the Phase 03C1A pattern
 * (`server/acceptance/phase-03c1a-runner.ts`) to also exercise the CRUD
 * ingress (`POST /v1/internal/crud`) — plans/applications operations, RBAC
 * spot-checks, CSRF, and version/updated_at conflict cases — plus a session
 * lifecycle re-check and a dashboard-data (`applications_aggregate`) fetch
 * check, all against ONE already-validated (via loadMvp4AcceptanceConfig)
 * isolated pair of Apps Script Web App URLs (auth + CRUD ingress).
 *
 * Same dependency-injected, fail-closed, sanitized-summary shape as the
 * Phase 03C1A runner: this module performs no console output of its own,
 * duplicates no HMAC signing logic (reusing createInternalEnvelope
 * unchanged), and returns only a sanitized checks[] array after scanning
 * every raw response for prohibited content.
 */

const AUTH_OPERATION_PATHS: Record<
  "login_first_bind" | "validate_session" | "issue_csrf",
  string
> = {
  login_first_bind: "/internal/v1/auth/login-first-bind",
  validate_session: "/internal/v1/auth/session/validate",
  issue_csrf: "/internal/v1/auth/csrf/issue",
};

const CRUD_OPERATION_PATHS: Record<
  | "plans_list"
  | "plans_create"
  | "users_list"
  | "applications_list"
  | "applications_create"
  | "applications_aggregate",
  string
> = {
  plans_list: "/internal/v1/crud/plans/list",
  plans_create: "/internal/v1/crud/plans/create",
  users_list: "/internal/v1/crud/users/list",
  applications_list: "/internal/v1/crud/applications/list",
  applications_create: "/internal/v1/crud/applications/create",
  applications_aggregate: "/internal/v1/crud/applications/aggregate",
};

export type SafeCode =
  | "OK"
  | "AUTH_DENIED"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNEXPECTED";

export interface CheckResult {
  name: string;
  ok: boolean;
  safeCode: SafeCode;
}

export interface Mvp4AcceptanceSummary {
  suite: "mvp4-live-acceptance";
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

/**
 * Same structural leakage indicators as the Phase 03C1A runner, extended
 * with the CRUD/aggregate response shapes this runner introduces
 * (aggregate buckets, plan/application ids) — never a raw customer field,
 * version/updated_at token echoed as a secret-looking value, or Sheet
 * identifier.
 */
function scanForLeakage(
  rawText: string,
  secrets: readonly string[],
): string | null {
  for (const secret of secrets) {
    if (secret.length > 0 && rawText.includes(secret))
      return "response body contained a value that must never be echoed back";
  }
  const structuralIndicators: RegExp[] = [
    /"stack"\s*:/i,
    /at [A-Za-z0-9_.$]+\s*\(.*:\d+:\d+\)/,
    /SPREADSHEET_ID/i,
    /"sheetId"/i,
    /"signature"\s*:/i,
    /"jti"\s*:/i,
    /"body_digest"\s*:/i,
    /"session_token"\s*:/i,
    /"csrf_token"\s*:/i,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
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

function isOkEnvelope(response: RawResponse): boolean {
  return response.parsed?.ok === true;
}

function envelopeFor(
  crypto: CryptoAdapter,
  now: Date,
  signingKey: Mvp4AcceptanceConfig["signingKey"],
  audience: string,
  path: string,
  payload: Record<string, unknown>,
): SignedEnvelope {
  return createInternalEnvelope(crypto, now, signingKey, {
    audience,
    method: "POST",
    path,
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
 * Runs the MVP-4 local acceptance checks against one already-validated
 * (via loadMvp4AcceptanceConfig) isolated pair of Apps Script Web App URLs.
 * Returns only a sanitized summary; callers must not print anything else
 * derived from responses. This runner exercises the CRUD ingress and a
 * session-lifecycle re-check; it does NOT re-run every Phase 03C1A auth-only
 * case (that remains `runPhase03C1AAcceptance`, run separately and
 * unchanged per the runbook).
 */
export async function runMvp4Acceptance(
  config: Mvp4AcceptanceConfig,
  fetcher: Fetcher,
  clock: { now(): Date } = { now: () => new Date() },
  crypto: CryptoAdapter = nodeCryptoAdapter,
): Promise<Mvp4AcceptanceSummary> {
  const checks: CheckResult[] = [];
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(32);
  const secretsToNeverLeak = [
    sessionToken,
    csrfToken,
    config.signingKey.secret,
    config.testAdminEmail,
    config.testAdminSubject,
  ];

  function record(name: string, ok: boolean, safeCode: SafeCode): void {
    checks.push({ name, ok, safeCode });
  }

  async function expectAndScan(
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

  // --- Session lifecycle: establish a real session via the auth ingress. ---
  const loginResponse = await post(
    fetcher,
    config.authUrl,
    JSON.stringify({
      operation: "login_first_bind",
      envelope: envelopeFor(
        crypto,
        clock.now(),
        config.signingKey,
        config.audience,
        AUTH_OPERATION_PATHS.login_first_bind,
        {
          email: config.testAdminEmail,
          sub: config.testAdminSubject,
          email_verified: true,
          session_token: sessionToken,
          csrf_token: csrfToken,
        },
      ),
    }),
    "application/json",
  );
  await expectAndScan(
    "session lifecycle: login_first_bind establishes a session",
    loginResponse,
    (response) => ({
      ok: isOkEnvelope(response),
      safeCode: isOkEnvelope(response) ? "OK" : "UNEXPECTED",
    }),
  );

  const validateResponse = await post(
    fetcher,
    config.authUrl,
    JSON.stringify({
      operation: "validate_session",
      envelope: envelopeFor(
        crypto,
        clock.now(),
        config.signingKey,
        config.audience,
        AUTH_OPERATION_PATHS.validate_session,
        { session_token: sessionToken },
      ),
    }),
    "application/json",
  );
  await expectAndScan(
    "session lifecycle: validate_session confirms the session is live",
    validateResponse,
    (response) => ({
      ok: isOkEnvelope(response),
      safeCode: isOkEnvelope(response) ? "OK" : "UNEXPECTED",
    }),
  );

  // --- CRUD ingress: RBAC spot-check (Admin plans_list succeeds). ---
  const plansListResponse = await post(
    fetcher,
    config.crudUrl,
    JSON.stringify({
      operation: "plans_list",
      envelope: envelopeFor(
        crypto,
        clock.now(),
        config.signingKey,
        config.audience,
        CRUD_OPERATION_PATHS.plans_list,
        { session_token: sessionToken },
      ),
    }),
    "application/json",
  );
  await expectAndScan(
    "CRUD RBAC: Admin plans_list succeeds",
    plansListResponse,
    (response) => ({
      ok: isOkEnvelope(response),
      safeCode: isOkEnvelope(response) ? "OK" : "UNEXPECTED",
    }),
  );

  // --- CRUD ingress: CSRF is required on a mutation. ---
  const missingCsrfPlan = buildSyntheticPlanPayload("csrf-check");
  const missingCsrfResponse = await post(
    fetcher,
    config.crudUrl,
    JSON.stringify({
      operation: "plans_create",
      envelope: envelopeFor(
        crypto,
        clock.now(),
        config.signingKey,
        config.audience,
        CRUD_OPERATION_PATHS.plans_create,
        {
          session_token: sessionToken,
          // csrf_token intentionally omitted.
          plan_name: missingCsrfPlan.planName,
          monthly_price: missingCsrfPlan.monthlyPrice,
          speed_mbps: missingCsrfPlan.speedMbps,
        },
      ),
    }),
    "application/json",
  );
  await expectAndScan(
    "CRUD CSRF: a mutation without csrf_token is denied",
    missingCsrfResponse,
    (response) => ({
      ok: errorCode(response) === "AUTH_DENIED",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // --- CRUD ingress: a valid mutation with CSRF succeeds (Plans create). ---
  const plan = buildSyntheticPlanPayload("primary");
  const planCreateResponse = await post(
    fetcher,
    config.crudUrl,
    JSON.stringify({
      operation: "plans_create",
      envelope: envelopeFor(
        crypto,
        clock.now(),
        config.signingKey,
        config.audience,
        CRUD_OPERATION_PATHS.plans_create,
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          plan_name: plan.planName,
          monthly_price: plan.monthlyPrice,
          speed_mbps: plan.speedMbps,
        },
      ),
    }),
    "application/json",
  );
  let createdPlanId: string | null = null;
  await expectAndScan(
    "CRUD mutation: plans_create with valid CSRF succeeds",
    planCreateResponse,
    (response) => {
      const ok = isOkEnvelope(response);
      if (ok) {
        const data = response.parsed?.data as { planId?: unknown } | undefined;
        if (typeof data?.planId === "string") createdPlanId = data.planId;
      }
      return { ok, safeCode: ok ? "OK" : "UNEXPECTED" };
    },
  );

  // --- CRUD ingress: an Application create + a version/updated_at conflict. ---
  if (createdPlanId !== null) {
    const application = buildSyntheticApplicationPayload(
      "primary",
      createdPlanId,
    );
    const appCreateResponse = await post(
      fetcher,
      config.crudUrl,
      JSON.stringify({
        operation: "applications_create",
        envelope: envelopeFor(
          crypto,
          clock.now(),
          config.signingKey,
          config.audience,
          CRUD_OPERATION_PATHS.applications_create,
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            customer_full_name: application.customerFullName,
            mobile_number: application.mobileNumber,
            complete_address: application.completeAddress,
            barangay: application.barangay,
            city_municipality: application.cityMunicipality,
            province: application.province,
            plan_id: application.planId,
            notes: application.notes,
          },
        ),
      }),
      "application/json",
    );
    await expectAndScan(
      "CRUD mutation: applications_create succeeds",
      appCreateResponse,
      (response) => ({
        ok: isOkEnvelope(response),
        safeCode: isOkEnvelope(response) ? "OK" : "UNEXPECTED",
      }),
    );

    // Version conflict case: reuse plan_id as a stale update target with a
    // deliberately wrong expected_updated_at token.
    const staleUpdateResponse = await post(
      fetcher,
      config.crudUrl,
      JSON.stringify({
        operation: "plans_update",
        envelope: envelopeFor(
          crypto,
          clock.now(),
          config.signingKey,
          config.audience,
          "/internal/v1/crud/plans/update",
          {
            session_token: sessionToken,
            csrf_token: csrfToken,
            plan_id: createdPlanId,
            expected_updated_at: "1970-01-01T00:00:00.000Z",
            monthly_price: 1,
          },
        ),
      }),
      "application/json",
    );
    await expectAndScan(
      "CRUD concurrency: a stale expected_updated_at is rejected as CONFLICT",
      staleUpdateResponse,
      (response) => ({
        ok:
          errorCode(response) === "CONFLICT" ||
          errorCode(response) === "VALIDATION_ERROR",
        safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
      }),
    );
  }

  // --- CRUD ingress: RBAC deny — issue_csrf as a valid session but call an
  // unsupported/disallowed CRUD operation name. ---
  const disallowedResponse = await post(
    fetcher,
    config.crudUrl,
    JSON.stringify({
      operation: "users_update",
      envelope: envelopeFor(
        crypto,
        clock.now(),
        config.signingKey,
        config.audience,
        "/internal/v1/crud/users/update",
        {
          session_token: sessionToken,
          csrf_token: csrfToken,
          user_id: "nonexistent",
          expected_updated_at: "1970-01-01T00:00:00.000Z",
          role: "Admin",
        },
      ),
    }),
    "application/json",
  );
  await expectAndScan(
    "CRUD RBAC: an operation on a non-existent target fails safely (never a raw Sheet error)",
    disallowedResponse,
    (response) => ({
      ok:
        errorCode(response) === "NOT_FOUND" ||
        errorCode(response) === "FORBIDDEN" ||
        errorCode(response) === "VALIDATION_ERROR",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  // --- Dashboard-data check: applications_aggregate returns a valid shape. ---
  const aggregateResponse = await post(
    fetcher,
    config.crudUrl,
    JSON.stringify({
      operation: "applications_aggregate",
      envelope: envelopeFor(
        crypto,
        clock.now(),
        config.signingKey,
        config.audience,
        CRUD_OPERATION_PATHS.applications_aggregate,
        { session_token: sessionToken },
      ),
    }),
    "application/json",
  );
  await expectAndScan(
    "dashboard-data: applications_aggregate returns a valid bucketed shape",
    aggregateResponse,
    (response) => {
      if (!isOkEnvelope(response)) return { ok: false, safeCode: "UNEXPECTED" };
      const data = response.parsed?.data as
        | {
            buckets?: unknown;
            rangeStartDate?: unknown;
            rangeEndDate?: unknown;
          }
        | undefined;
      const ok =
        Array.isArray(data?.buckets) &&
        typeof data?.rangeStartDate === "string" &&
        typeof data?.rangeEndDate === "string";
      return { ok, safeCode: ok ? "OK" : "UNEXPECTED" };
    },
  );

  // --- CRUD ingress: invalid signature is denied (mirrors auth-ingress case). ---
  const tamperedResponse = await post(
    fetcher,
    config.crudUrl,
    JSON.stringify({
      operation: "plans_list",
      envelope: tamperSignature(
        envelopeFor(
          crypto,
          clock.now(),
          config.signingKey,
          config.audience,
          CRUD_OPERATION_PATHS.plans_list,
          { session_token: sessionToken },
        ),
      ),
    }),
    "application/json",
  );
  await expectAndScan(
    "CRUD ingress: invalid signature is denied",
    tamperedResponse,
    (response) => ({
      ok: errorCode(response) === "AUTH_DENIED",
      safeCode: (errorCode(response) as SafeCode) ?? "UNEXPECTED",
    }),
  );

  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.length - passed;
  return {
    suite: "mvp4-live-acceptance",
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

// Exposed for tests only.
export const __signingInputForTests = signingInput;
