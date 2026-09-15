import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * CLI entrypoint for the Phase 03C1A live acceptance runner
 * (server/acceptance/phase-03c1a-runner.ts + env.ts). This script performs
 * no validation or signing logic of its own: it bundles the TypeScript
 * runner with esbuild (matching the existing apps-script build tooling
 * pattern) and executes it, printing only the sanitized summary the runner
 * itself returns.
 *
 * This script targets exactly one already-explicitly-configured isolated
 * Apps Script Web App URL, read from PHASE_03C1A_TARGET_URL. It refuses to
 * run without an explicit non-production confirmation
 * (PHASE_03C1A_CONFIRM_NON_PRODUCTION). See
 * docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md for full setup and teardown.
 *
 * This script never deploys, commits, or pushes anything, and is never
 * invoked automatically by npm test/build/lint — it must be run explicitly
 * and only against a prepared isolated resource.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const tempDirectory = await mkdtemp(join(tmpdir(), "phase-03c1a-runner-"));
  const outfile = join(tempDirectory, "runner.mjs");
  try {
    await build({
      absWorkingDir: projectRoot,
      entryPoints: ["scripts/phase-03c1a-cli-entry.ts"],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      sourcemap: false,
      sourcesContent: false,
      legalComments: "none",
      minify: false,
      logLevel: "silent",
    });
    const module = await import(pathToFileURL(outfile).href);
    const exitCode = await module.main();
    process.exitCode = exitCode;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  // Only the error's constructor name and message are safe to print: both
  // are authored by this repository's own config/validation code, never by
  // an Apps Script/HTTP response body.
  console.error(
    `Phase 03C1A acceptance runner failed to start: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
