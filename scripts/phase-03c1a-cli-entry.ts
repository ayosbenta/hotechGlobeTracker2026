import {
  AcceptanceConfigError,
  loadAcceptanceConfig,
} from "../server/acceptance/env";
import {
  nodeFetcher,
  runPhase03C1AAcceptance,
} from "../server/acceptance/phase-03c1a-runner";

/**
 * Thin printing shell around the pure acceptance runner. The only values
 * this ever writes to stdout/stderr are: a config-error message (authored by
 * this repository's own validation code, never by a live response body) and
 * the runner's own sanitized JSON summary (suite/ok/passed/failed/checks
 * with name/ok/safeCode only).
 *
 * Pass "--check-only" to validate configuration (env vars, URL suffix,
 * non-production confirmation, secret shape) WITHOUT sending any HTTP
 * request. Useful to confirm setup before running the live suite.
 */
export async function main(): Promise<number> {
  const checkOnly = process.argv.includes("--check-only");

  let config;
  try {
    config = loadAcceptanceConfig();
  } catch (error) {
    if (error instanceof AcceptanceConfigError) {
      console.error(error.message);
      return 1;
    }
    console.error("Phase 03C1A acceptance configuration failed to load.");
    return 1;
  }

  if (checkOnly) {
    // Print only the shape of what was loaded, never a secret value.
    console.log(
      JSON.stringify(
        {
          configValid: true,
          targetUrlEndsWithRequiredSuffix: config.internalUrl.endsWith(
            "/exec/v1/internal/auth",
          ),
          audienceConfigured: config.audience.length > 0,
          hmacKeyIdConfigured: config.signingKey.keyId.length > 0,
          hmacSecretLength: config.signingKey.secret.length,
          testUserEmailConfigured: config.testUserEmail.length > 0,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const summary = await runPhase03C1AAcceptance(config, nodeFetcher());
  console.log(JSON.stringify(summary, null, 2));
  return summary.ok ? 0 : 1;
}
