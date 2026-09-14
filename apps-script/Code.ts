import { appendActivityLog } from "./core/audit";
import { handleGet, handlePost } from "./core/api";
import { loadServerConfig } from "./core/config";
import { withScriptLock } from "./core/lock";
import { serialize } from "./core/response";
import { SheetRepository } from "./core/repository";
import { createAppsScriptUuidGenerator, systemClock } from "./core/runtime";
import { initializeSchema } from "./core/schema";
import {
  migrateAuthSchema,
  type MutableScriptProperties,
} from "./core/auth-schema";
import { appsScriptRuntime } from "./infrastructure/google-apps-script";
import { loadAuthConfig } from "./core/auth-config";
import { appsScriptCrypto } from "./core/apps-script-auth-crypto";
import { executeInternalAuth, type Operation } from "./core/auth-domain";
import { SheetAuthStore } from "./core/sheet-auth-store";
import {
  cleanupPhase03BAcceptanceData as cleanupPhase03BAcceptanceDataInternal,
  runPhase03BAcceptanceSuite as runPhase03BAcceptanceSuiteInternal,
  sanitizeAcceptanceSummary,
} from "./core/phase-03b-acceptance";

interface AppsScriptEvent {
  pathInfo?: string;
}

function dependencies() {
  const runtime = appsScriptRuntime();
  return {
    clock: systemClock,
    uuidGenerator: createAppsScriptUuidGenerator(runtime.Utilities),
    validateConfiguration: () => {
      loadServerConfig(runtime.PropertiesService.getScriptProperties());
    },
  };
}

function jsonOutput(payload: string): unknown {
  const runtime = appsScriptRuntime();
  return runtime.ContentService.createTextOutput(payload).setMimeType(
    runtime.ContentService.MimeType.JSON,
  );
}

/** Public, read-only health route. It deliberately reveals no configuration. */
export function doGet(event: AppsScriptEvent): unknown {
  return jsonOutput(serialize(handleGet(event, dependencies())));
}

/** No POST operations are enabled in Phase 02. */
export function doPost(event: AppsScriptEvent): unknown {
  const { clock, uuidGenerator } = dependencies();
  return jsonOutput(serialize(handlePost(event, { clock, uuidGenerator })));
}

/**
 * Run manually by the Sheet owner from the Apps Script editor. This function
 * is intentionally not available through doGet/doPost.
 */
export function bootstrapSchema(): void {
  const runtime = appsScriptRuntime();
  const config = loadServerConfig(
    runtime.PropertiesService.getScriptProperties(),
  );
  const uuidGenerator = createAppsScriptUuidGenerator(runtime.Utilities);

  withScriptLock(runtime.LockService, () => {
    const spreadsheet = runtime.SpreadsheetApp.openById(config.spreadsheetId);
    const repository = new SheetRepository(spreadsheet);
    initializeSchema(spreadsheet);
    const activityLogs = repository.requiredSheet("Activity_Logs");
    appendActivityLog(
      activityLogs,
      {
        actorUserId: "SYSTEM_BOOTSTRAP",
        action: "SCHEMA_BOOTSTRAP",
        entityType: "Spreadsheet",
        entityId: "schema",
        requestId: uuidGenerator.generate(),
        metadata: { source: "Apps Script editor" },
      },
      systemClock,
      uuidGenerator,
    );
  });
}

/** Owner-run only. This is intentionally not a web route or live auth flow. */
export function migrateAuthSchemaPhase03A(): void {
  const runtime = appsScriptRuntime();
  const config = loadServerConfig(
    runtime.PropertiesService.getScriptProperties(),
  );
  withScriptLock(runtime.LockService, () => {
    migrateAuthSchema(
      runtime.SpreadsheetApp.openById(config.spreadsheetId),
      runtime.PropertiesService.getScriptProperties() as MutableScriptProperties,
    );
  });
}

/**
 * Phase 03B internal domain entrypoint. This is deliberately not connected to
 * doGet/doPost; Phase 03C supplies the trusted transport adapter.
 */
export function executeInternalAuthPhase03B(
  operation: Operation,
  envelope: unknown,
): unknown {
  const runtime = appsScriptRuntime();
  const config = loadAuthConfig(
    runtime.PropertiesService.getScriptProperties(),
  );
  return withScriptLock(runtime.LockService, () =>
    executeInternalAuth(operation, envelope, {
      config,
      crypto: appsScriptCrypto(runtime.Utilities),
      clock: systemClock,
      ids: createAppsScriptUuidGenerator(runtime.Utilities),
      store: new SheetAuthStore(
        runtime.SpreadsheetApp.openById(config.spreadsheetId),
      ),
      lock: { run: (work) => work() },
    }),
  );
}

/** Owner/editor-only evidence reconciliation; never routed through web handlers. */
export function reconcileAuthAuditPhase03B(): number {
  const runtime = appsScriptRuntime();
  const config = loadAuthConfig(
    runtime.PropertiesService.getScriptProperties(),
  );
  return withScriptLock(runtime.LockService, () =>
    new SheetAuthStore(
      runtime.SpreadsheetApp.openById(config.spreadsheetId),
    ).reconcileIncompleteAudits(),
  );
}

/** Owner/editor-only isolated acceptance suite. It is never web routed. */
export function runPhase03BAcceptanceSuite(): unknown {
  const runtime = appsScriptRuntime();
  const properties =
    runtime.PropertiesService.getScriptProperties() as MutableScriptProperties;
  const spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  if (spreadsheetId === null)
    throw new Error("Acceptance isolation guard failed.");
  const summary = runPhase03BAcceptanceSuiteInternal({
    properties,
    spreadsheet: runtime.SpreadsheetApp.openById(spreadsheetId),
    cryptoUtilities: runtime.Utilities,
  });
  // Exactly one whitelisted, sanitized execution-log line for editor review.
  const safeSummary = sanitizeAcceptanceSummary(summary);
  runtime.Logger.log(JSON.stringify(safeSummary));
  return safeSummary;
}

/** Owner/editor-only prefix-scoped cleanup fallback. It is never web routed. */
export function cleanupPhase03BAcceptanceData(): boolean {
  const runtime = appsScriptRuntime();
  const properties =
    runtime.PropertiesService.getScriptProperties() as MutableScriptProperties;
  const spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  if (spreadsheetId === null)
    throw new Error("Acceptance isolation guard failed.");
  return cleanupPhase03BAcceptanceDataInternal({
    properties,
    spreadsheet: runtime.SpreadsheetApp.openById(spreadsheetId),
    cryptoUtilities: runtime.Utilities,
  });
}
