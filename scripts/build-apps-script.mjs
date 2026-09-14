import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(projectRoot, "apps-script");
const outputDirectory = resolve(sourceDirectory, "generated");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  absWorkingDir: projectRoot,
  entryPoints: ["apps-script/Code.ts"],
  outfile: resolve(outputDirectory, "Code.js"),
  bundle: true,
  format: "iife",
  globalName: "HotechGlobeTracker",
  platform: "browser",
  target: "es2019",
  sourcemap: false,
  sourcesContent: false,
  legalComments: "none",
  minify: false,
  charset: "utf8",
  footer: {
    js: [
      "function doGet(e) { return HotechGlobeTracker.doGet(e); }",
      "function doPost(e) { return HotechGlobeTracker.doPost(e); }",
      "function bootstrapSchema() { return HotechGlobeTracker.bootstrapSchema(); }",
      "function migrateAuthSchemaPhase03A() { return HotechGlobeTracker.migrateAuthSchemaPhase03A(); }",
      "function reconcileAuthAuditPhase03B() { return HotechGlobeTracker.reconcileAuthAuditPhase03B(); }",
      "function runPhase03BAcceptanceSuite() { return HotechGlobeTracker.runPhase03BAcceptanceSuite(); }",
      "function cleanupPhase03BAcceptanceData() { return HotechGlobeTracker.cleanupPhase03BAcceptanceData(); }",
    ].join("\n"),
  },
  logLevel: "silent",
});

await cp(
  resolve(sourceDirectory, "appsscript.json"),
  resolve(outputDirectory, "appsscript.json"),
);

console.log("Generated apps-script/generated/Code.js and appsscript.json");
