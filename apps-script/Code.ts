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
import { executeCrud } from "./core/crud-domain";
import { PlansRepository } from "./core/plans-repository";
import { UsersRepository } from "./core/users-repository";
import { ApplicationsRepository } from "./core/applications-repository";
import type { CrudOperation } from "./core/contracts";
import {
  cleanupPhase03BAcceptanceData as cleanupPhase03BAcceptanceDataInternal,
  runPhase03BAcceptanceSuite as runPhase03BAcceptanceSuiteInternal,
  sanitizeAcceptanceSummary,
} from "./core/phase-03b-acceptance";

interface AppsScriptEvent {
  pathInfo?: string;
  postData?: { type?: string; contents?: string };
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

/**
 * The only routed POST paths are the internal-auth ingress at
 * `/v1/internal/auth` and the internal-CRUD ingress at `/v1/internal/crud`,
 * dispatching unchanged into the frozen Phase 03B domain and the MVP-2A CRUD
 * domain respectively. Every other POST path retains the frozen safe
 * NOT_FOUND response.
 */
export function doPost(event: AppsScriptEvent): unknown {
  const { clock, uuidGenerator } = dependencies();
  return jsonOutput(
    serialize(
      handlePost(event, {
        clock,
        uuidGenerator,
        internalAuth: (operation, envelope) =>
          executeInternalAuthPhase03B(operation, envelope) as {
            userId?: string;
            role?: string;
            sessionId?: string;
          },
        internalCrud: (operation, envelope) =>
          executeCrudPhase2A(operation, envelope),
      }),
    ),
  );
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
  const store = new SheetAuthStore(
    runtime.SpreadsheetApp.openById(config.spreadsheetId),
  );
  return withScriptLock(runtime.LockService, () =>
    executeInternalAuth(operation, envelope, {
      config,
      crypto: appsScriptCrypto(runtime.Utilities),
      clock: systemClock,
      ids: createAppsScriptUuidGenerator(runtime.Utilities),
      store,
      // Same adapter: SheetAuthStore implements both AuthStore and
      // PasswordCredentialStore (D-050 batch 2).
      passwordStore: store,
      lock: { run: (work) => work() },
    }),
  );
}

/**
 * MVP-2A CRUD domain entrypoint. Reuses the frozen Phase 03A/03B auth
 * schema/store for session validation and the frozen script-lock primitive;
 * deliberately not connected to doGet — only doPost's internal-CRUD ingress
 * calls this.
 */
export function executeCrudPhase2A(
  operation: CrudOperation,
  envelope: unknown,
): { data: unknown; nextCursor: string | null } {
  const runtime = appsScriptRuntime();
  const config = loadAuthConfig(
    runtime.PropertiesService.getScriptProperties(),
  );
  return withScriptLock(runtime.LockService, () => {
    const spreadsheet = runtime.SpreadsheetApp.openById(config.spreadsheetId);
    const repository = new SheetRepository(spreadsheet);
    return executeCrud(operation, envelope, {
      config,
      crypto: appsScriptCrypto(runtime.Utilities),
      clock: systemClock,
      ids: createAppsScriptUuidGenerator(runtime.Utilities),
      authStore: new SheetAuthStore(spreadsheet),
      lock: { run: (work) => work() },
      plansRepository: new PlansRepository(repository.requiredSheet("Plans")),
      usersRepository: new UsersRepository(repository.requiredSheet("Users")),
      applicationsRepository: new ApplicationsRepository(
        repository.requiredSheet("Applications"),
      ),
      activityLogSheet: repository.requiredSheet("Activity_Logs"),
      statusHistorySheet: repository.requiredSheet("Status_History"),
    });
  });
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
