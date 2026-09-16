import type { SigningKey } from "../auth/signing";

/**
 * Minimal, dedicated environment loader for the MVP-4 live acceptance
 * runner only (CRUD ingress + session lifecycle + dashboard-data checks). It
 * follows the exact same fail-closed pattern as
 * `server/acceptance/env.ts` (Phase 03C1A's auth-only runner) rather than
 * duplicating or loosening it, extended for the CRUD ingress URL this
 * runner also needs. It intentionally does not reuse `server/auth/env.ts`
 * (the full BFF server environment, which this narrowly scoped local tool
 * has no need for) and never accepts a secret as a CLI argument.
 */

const AUTH_REQUIRED_ENDING = "/exec/v1/internal/auth";
const CRUD_REQUIRED_ENDING = "/exec/v1/internal/crud";

export interface Mvp4AcceptanceConfig {
  authUrl: string;
  crudUrl: string;
  audience: string;
  signingKey: SigningKey;
  /** A pre-provisioned isolated Admin user's normalized email, for login_first_bind. */
  testAdminEmail: string;
  /** An arbitrary non-empty synthetic provider subject for first bind. */
  testAdminSubject: string;
}

export class Mvp4AcceptanceConfigError extends Error {
  constructor(reason: string) {
    super(`MVP-4 acceptance configuration is invalid: ${reason}`);
    this.name = "Mvp4AcceptanceConfigError";
  }
}

function required(
  source: Record<string, string | undefined>,
  key: string,
): string {
  const value = source[key]?.trim();
  if (!value) throw new Mvp4AcceptanceConfigError(`${key} is missing.`);
  return value;
}

/**
 * Same best-effort, text-only production heuristic as
 * `server/acceptance/env.ts` — never a substitute for the mandatory explicit
 * confirmation literal below.
 */
const PRODUCTION_LOOKING_PATTERNS = [
  /\bprod(uction)?\b/i,
  /\blive\b/i,
] as const;

function assertNonProduction(value: string): void {
  if (PRODUCTION_LOOKING_PATTERNS.some((pattern) => pattern.test(value)))
    throw new Mvp4AcceptanceConfigError(
      "a configured value looks production-labeled; this tool only targets isolated non-production deployments.",
    );
}

function assertExactSuffix(url: string, requiredEnding: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Mvp4AcceptanceConfigError("a target URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:")
    throw new Mvp4AcceptanceConfigError("a target URL must be HTTPS.");
  if (!url.endsWith(requiredEnding))
    throw new Mvp4AcceptanceConfigError(
      `a target URL must end exactly with "${requiredEnding}".`,
    );
}

function assertConfirmation(source: Record<string, string | undefined>): void {
  const value = source.MVP4_CONFIRM_NON_PRODUCTION?.trim();
  if (value !== "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION")
    throw new Mvp4AcceptanceConfigError(
      'MVP4_CONFIRM_NON_PRODUCTION must be set to the exact literal "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION" to confirm this targets an isolated, non-production deployment.',
    );
}

function assertSecretShape(value: string, key: string): string {
  if (value.length < 32)
    throw new Mvp4AcceptanceConfigError(
      `${key} must be at least 32 characters.`,
    );
  return value;
}

/**
 * Loads and validates the MVP-4 acceptance runner's environment. Reads
 * secrets only from environment variables; fails closed on any missing,
 * malformed, or production-looking value, exactly like
 * `server/acceptance/env.ts`'s Phase 03C1A loader. Returns nothing beyond
 * what the runner needs.
 */
export function loadMvp4AcceptanceConfig(
  source: Record<string, string | undefined> = process.env,
): Mvp4AcceptanceConfig {
  assertConfirmation(source);

  const authUrl = required(source, "MVP4_AUTH_TARGET_URL");
  assertExactSuffix(authUrl, AUTH_REQUIRED_ENDING);
  assertNonProduction(authUrl);

  const crudUrl = required(source, "MVP4_CRUD_TARGET_URL");
  assertExactSuffix(crudUrl, CRUD_REQUIRED_ENDING);
  assertNonProduction(crudUrl);

  const audience = required(source, "MVP4_INTERNAL_AUDIENCE");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(audience))
    throw new Mvp4AcceptanceConfigError(
      "MVP4_INTERNAL_AUDIENCE has an invalid shape.",
    );
  assertNonProduction(audience);

  const keyId = required(source, "MVP4_HMAC_KEY_ID");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(keyId))
    throw new Mvp4AcceptanceConfigError(
      "MVP4_HMAC_KEY_ID has an invalid shape.",
    );

  const secret = assertSecretShape(
    required(source, "MVP4_HMAC_SECRET"),
    "MVP4_HMAC_SECRET",
  );

  const testAdminEmail = required(source, "MVP4_TEST_ADMIN_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testAdminEmail))
    throw new Mvp4AcceptanceConfigError(
      "MVP4_TEST_ADMIN_EMAIL has an invalid shape.",
    );

  const testAdminSubject = required(source, "MVP4_TEST_ADMIN_SUBJECT");
  if (testAdminSubject.length < 4)
    throw new Mvp4AcceptanceConfigError(
      "MVP4_TEST_ADMIN_SUBJECT is too short.",
    );

  return {
    authUrl,
    crudUrl,
    audience,
    signingKey: { keyId, secret },
    testAdminEmail,
    testAdminSubject,
  };
}
