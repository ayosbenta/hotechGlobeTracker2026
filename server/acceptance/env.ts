import type { SigningKey } from "../auth/signing";

/**
 * Minimal, dedicated environment loader for the Phase 03C1A live acceptance
 * runner only. It intentionally does not reuse `server/auth/env.ts`, which
 * validates the full BFF environment (Google, Upstash, rate limiting) that
 * this narrowly scoped tool has no need for and must not require.
 *
 * Fails closed on any missing, malformed, or production-looking value. Never
 * logs a secret, and never returns anything beyond what the runner needs.
 */

const REQUIRED_ENDING = "/exec/v1/internal/auth";

export interface AcceptanceRunnerConfig {
  internalUrl: string;
  audience: string;
  signingKey: SigningKey;
  /** A pre-provisioned isolated user's normalized email, for login_first_bind. */
  testUserEmail: string;
  /** An arbitrary non-empty synthetic Google subject for first bind. */
  testUserSubject: string;
}

export class AcceptanceConfigError extends Error {
  constructor(reason: string) {
    super(`Phase 03C1A acceptance configuration is invalid: ${reason}`);
    this.name = "AcceptanceConfigError";
  }
}

function required(
  source: Record<string, string | undefined>,
  key: string,
): string {
  const value = source[key]?.trim();
  if (!value) throw new AcceptanceConfigError(`${key} is missing.`);
  return value;
}

/**
 * Defense against pointing this tool at a live production deployment. This
 * is a best-effort heuristic on the URL text alone: it does not and cannot
 * know whether a given URL is actually production, which is why an explicit
 * confirmation flag (below) is also mandatory.
 */
const PRODUCTION_LOOKING_PATTERNS = [
  /\bprod(uction)?\b/i,
  /\blive\b/i,
] as const;

function assertNonProduction(url: string): void {
  if (PRODUCTION_LOOKING_PATTERNS.some((pattern) => pattern.test(url)))
    throw new AcceptanceConfigError(
      "the target URL looks production-labeled; this tool only targets isolated non-production deployments.",
    );
}

function assertExactSuffix(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AcceptanceConfigError("the target URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:")
    throw new AcceptanceConfigError("the target URL must be HTTPS.");
  if (!url.endsWith(REQUIRED_ENDING))
    throw new AcceptanceConfigError(
      `the target URL must end exactly with "${REQUIRED_ENDING}".`,
    );
}

function assertConfirmation(source: Record<string, string | undefined>): void {
  const value = source.PHASE_03C1A_CONFIRM_NON_PRODUCTION?.trim();
  if (value !== "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION")
    throw new AcceptanceConfigError(
      'PHASE_03C1A_CONFIRM_NON_PRODUCTION must be set to the exact literal "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION" to confirm this targets an isolated, non-production deployment.',
    );
}

function assertSecretShape(value: string, key: string): string {
  if (value.length < 32)
    throw new AcceptanceConfigError(`${key} must be at least 32 characters.`);
  return value;
}

/**
 * Loads and validates the acceptance runner's environment. Reads secrets
 * only from environment variables; never accepts them as CLI arguments
 * (which would leak into shell history/process listings).
 */
export function loadAcceptanceConfig(
  source: Record<string, string | undefined> = process.env,
): AcceptanceRunnerConfig {
  assertConfirmation(source);

  const internalUrl = required(source, "PHASE_03C1A_TARGET_URL");
  assertExactSuffix(internalUrl);
  assertNonProduction(internalUrl);

  const audience = required(source, "PHASE_03C1A_INTERNAL_AUDIENCE");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(audience))
    throw new AcceptanceConfigError(
      "PHASE_03C1A_INTERNAL_AUDIENCE has an invalid shape.",
    );
  assertNonProduction(audience);

  const keyId = required(source, "PHASE_03C1A_HMAC_KEY_ID");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(keyId))
    throw new AcceptanceConfigError(
      "PHASE_03C1A_HMAC_KEY_ID has an invalid shape.",
    );

  const secret = assertSecretShape(
    required(source, "PHASE_03C1A_HMAC_SECRET"),
    "PHASE_03C1A_HMAC_SECRET",
  );

  const testUserEmail = required(source, "PHASE_03C1A_TEST_USER_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testUserEmail))
    throw new AcceptanceConfigError(
      "PHASE_03C1A_TEST_USER_EMAIL has an invalid shape.",
    );

  const testUserSubject = required(source, "PHASE_03C1A_TEST_USER_SUBJECT");
  if (testUserSubject.length < 4)
    throw new AcceptanceConfigError(
      "PHASE_03C1A_TEST_USER_SUBJECT is too short.",
    );

  return {
    internalUrl,
    audience,
    signingKey: { keyId, secret },
    testUserEmail,
    testUserSubject,
  };
}
