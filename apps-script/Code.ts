import { appendActivityLog } from "./core/audit";
import { handleGet, handlePost } from "./core/api";
import { loadServerConfig } from "./core/config";
import { withScriptLock } from "./core/lock";
import { serialize } from "./core/response";
import { SheetRepository } from "./core/repository";
import { createAppsScriptUuidGenerator, systemClock } from "./core/runtime";
import { initializeSchema } from "./core/schema";
import { appsScriptRuntime } from "./infrastructure/google-apps-script";

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
