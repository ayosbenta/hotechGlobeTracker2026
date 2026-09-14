import type { Clock, UuidGenerator } from "./contracts";
import { toUtcIso } from "./runtime";
import type { SpreadsheetSheet } from "./schema";

export interface ActivityLogInput {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
  metadata: Record<string, unknown>;
}

export function appendActivityLog(
  sheet: SpreadsheetSheet,
  input: ActivityLogInput,
  clock: Clock,
  uuidGenerator: UuidGenerator,
): void {
  sheet.appendRow([
    uuidGenerator.generate(),
    input.actorUserId,
    input.action,
    input.entityType,
    input.entityId,
    input.requestId,
    JSON.stringify(input.metadata),
    toUtcIso(clock.now()),
  ]);
}
