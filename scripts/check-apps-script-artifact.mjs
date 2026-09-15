import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectRoot, "apps-script", "generated");
const expectedFiles = ["Code.js", "appsscript.json"];

function fail(message) {
  throw new Error(`Apps Script artifact check failed: ${message}`);
}

function globalFunctionBody(code, functionName) {
  // Matches the first definition, which is the real bundled implementation
  // inside the IIFE; a later same-named footer delegator (e.g.
  // `function doPost(e) { return HotechGlobeTracker.doPost(e); }`) is
  // intentionally not matched here.
  const signature = new RegExp(`function ${functionName}\\(\\w*\\) \\{`, "g");
  const match = signature.exec(code);
  if (match === null) fail(`missing global ${functionName} entrypoint`);

  let depth = 1;
  let cursor = signature.lastIndex;
  while (depth > 0 && cursor < code.length) {
    const character = code[cursor];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    cursor += 1;
  }
  if (depth !== 0) fail(`could not parse global ${functionName} entrypoint`);
  return code.slice(signature.lastIndex, cursor - 1);
}

let files;
try {
  files = (await readdir(outputDirectory)).sort();
} catch {
  fail("generated output directory is missing; run npm run gas:build first");
}

if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
  fail(`generated directory must contain only ${expectedFiles.join(" and ")}`);
}

const code = await readFile(resolve(outputDirectory, "Code.js"), "utf8");
const manifestText = await readFile(
  resolve(outputDirectory, "appsscript.json"),
  "utf8",
);

try {
  const manifest = JSON.parse(manifestText);
  if (manifest.runtimeVersion !== "V8") fail("appsscript.json must select V8");
} catch (error) {
  if (
    error instanceof Error &&
    error.message.startsWith("Apps Script artifact")
  )
    throw error;
  fail("appsscript.json is not valid JSON");
}

for (const entrypoint of [
  "doGet",
  "doPost",
  "bootstrapSchema",
  "reconcileAuthAuditPhase03B",
  "runPhase03BAcceptanceSuite",
  "cleanupPhase03BAcceptanceData",
]) {
  globalFunctionBody(code, entrypoint);
}

if (/^\s*(?:import|export)\s/m.test(code) || /\bimport\s*\(/.test(code)) {
  fail("unresolved import or export syntax remains in Code.js");
}

if (
  /\b(?:require|process|Buffer|__dirname|__filename)\b/.test(code) ||
  /["'](?:node:|fs|child_process|os|crypto)["']/.test(code)
) {
  fail("Code.js contains a Node.js-only global or module reference");
}

if (
  /sourceMappingURL/.test(code) ||
  files.some((file) => file.endsWith(".map"))
) {
  fail("Code.js contains a source map or source-machine path");
}

if (
  /AIza[0-9A-Za-z_-]{20,}|-----BEGIN [A-Z ]+-----|client_secret/i.test(code)
) {
  fail("Code.js appears to contain a credential");
}

if (/getRandomBytes|Math\.random/.test(code)) {
  fail("Code.js contains unsupported or unsafe token randomness");
}
if (
  /getUuid[\s\S]{0,160}(?:session_token|csrf|jti|signature)|(?:session_token|csrf|jti|signature)[\s\S]{0,160}getUuid/i.test(
    code,
  )
) {
  fail("Code.js uses UUID material for an authentication secret");
}

for (const token of [
  "INTERNAL_ERROR",
  "NOT_FOUND",
  "Request validation failed.",
]) {
  if (!code.includes(token))
    fail(`safe response-envelope token is missing: ${token}`);
}

for (const entrypoint of ["doGet", "doPost"]) {
  const body = globalFunctionBody(code, entrypoint);
  for (const forbidden of [
    "bootstrapSchema",
    "runPhase03BAcceptanceSuite",
    "cleanupPhase03BAcceptanceData",
    "reconcileAuthAuditPhase03B",
    "migrateAuthSchemaPhase03A",
  ]) {
    if (body.includes(forbidden))
      fail(`${entrypoint} must not route to ${forbidden}`);
  }
}

// doGet remains the frozen, unauthenticated health-only route: it must never
// reach the internal-auth dispatcher, the CRUD dispatcher, or any
// operation-specific internal path.
const doGetBody = globalFunctionBody(code, "doGet");
if (
  doGetBody.includes("executeInternalAuth") ||
  /\/internal\/v1\/auth\//.test(doGetBody)
)
  fail("doGet must not route to internal auth");
if (
  doGetBody.includes("executeCrud") ||
  /\/internal\/v1\/crud\//.test(doGetBody)
)
  fail("doGet must not route to internal CRUD");

// doPost's only routed operations are the internal-auth ingress at
// /v1/internal/auth, calling the frozen executeInternalAuthPhase03B entrypoint
// (which itself calls the frozen executeInternalAuth dispatcher), and the
// MVP-2A internal-CRUD ingress at /v1/internal/crud, calling
// executeCrudPhase2A. It must never expose rotate_session/revoke_session or
// perform dynamic/caller-keyed function dispatch.
const doPostBody = globalFunctionBody(code, "doPost");
if (!doPostBody.includes("executeInternalAuthPhase03B"))
  fail(
    "doPost must route the internal-auth ingress through executeInternalAuthPhase03B",
  );
if (
  !code.includes('"/v1/internal/auth"') &&
  !code.includes("'/v1/internal/auth'")
)
  fail("the internal-auth ingress route /v1/internal/auth is missing");
if (!doPostBody.includes("executeCrudPhase2A"))
  fail(
    "doPost must route the internal-CRUD ingress through executeCrudPhase2A",
  );
if (
  !code.includes('"/v1/internal/crud"') &&
  !code.includes("'/v1/internal/crud'")
)
  fail("the internal-CRUD ingress route /v1/internal/crud is missing");
for (const forbiddenOperation of ["rotate_session", "revoke_session"]) {
  if (doPostBody.includes(forbiddenOperation))
    fail(
      `doPost must not reference the editor-only operation ${forbiddenOperation}`,
    );
}
if (/global(?:This)?\s*\[/.test(doPostBody) || /\bwindow\s*\[/.test(doPostBody))
  fail("doPost must not perform dynamic/caller-keyed function dispatch");

console.log("Apps Script artifact checks passed");
