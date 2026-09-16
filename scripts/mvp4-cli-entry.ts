import {
  Mvp4AcceptanceConfigError,
  loadMvp4AcceptanceConfig,
} from "../server/acceptance/mvp4-env";
import {
  nodeFetcher,
  runMvp4Acceptance,
} from "../server/acceptance/mvp4-runner";

/**
 * Thin printing shell around the pure MVP-4 acceptance runner, mirroring
 * scripts/phase-03c1a-cli-entry.ts exactly. The only values this ever writes
 * to stdout/stderr are: a config-error message (authored by this
 * repository's own validation code, never by a live response body) and the
 * runner's own sanitized JSON summary (suite/ok/passed/failed/checks with
 * name/ok/safeCode only).
 *
 * Pass "--check-only" to validate configuration (env vars, URL suffixes,
 * non-production confirmation, secret shape) WITHOUT sending any HTTP
 * request. With no live target configured, this is also the ONLY mode that
 * completes successfully -- the runner fails closed with a clear
 * config-missing message rather than attempting a network call, exactly
 * like the Phase 03C1A runner does when its env vars are absent.
 */
export async function main(): Promise<number> {
  const checkOnly = process.argv.includes("--check-only");

  let config;
  try {
    config = loadMvp4AcceptanceConfig();
  } catch (error) {
    if (error instanceof Mvp4AcceptanceConfigError) {
      console.error(error.message);
      return 1;
    }
    console.error("MVP-4 acceptance configuration failed to load.");
    return 1;
  }

  if (checkOnly) {
    // Print only the shape of what was loaded, never a secret value.
    console.log(
      JSON.stringify(
        {
          configValid: true,
          authUrlEndsWithRequiredSuffix: config.authUrl.endsWith(
            "/exec/v1/internal/auth",
          ),
          crudUrlEndsWithRequiredSuffix: config.crudUrl.endsWith(
            "/exec/v1/internal/crud",
          ),
          audienceConfigured: config.audience.length > 0,
          hmacKeyIdConfigured: config.signingKey.keyId.length > 0,
          hmacSecretLength: config.signingKey.secret.length,
          testAdminEmailConfigured: config.testAdminEmail.length > 0,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const summary = await runMvp4Acceptance(config, nodeFetcher());
  console.log(JSON.stringify(summary, null, 2));
  return summary.ok ? 0 : 1;
}
