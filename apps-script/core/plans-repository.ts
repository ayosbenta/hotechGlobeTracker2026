import type { PlanRecord, PlanStatus } from "./contracts";
import type { SpreadsheetSheet } from "./schema";

const PLAN_STATUSES: readonly PlanStatus[] = ["Active", "Inactive"];

export function isPlanStatus(value: unknown): value is PlanStatus {
  return (
    typeof value === "string" &&
    (PLAN_STATUSES as readonly string[]).includes(value)
  );
}

function cells(sheet: SpreadsheetSheet): unknown[][] {
  return sheet.getLastRow() < 2
    ? []
    : sheet
        .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
        .getValues();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function toRecord(row: unknown[], rowPosition: number): PlanRecordWithRow {
  return {
    planId: text(row[0]),
    planName: text(row[1]),
    monthlyPrice: number(row[2]),
    speedMbps: number(row[3]),
    planStatus: isPlanStatus(row[4]) ? row[4] : "Inactive",
    createdAt: text(row[5]),
    updatedAt: text(row[6]),
    row: rowPosition,
  };
}

export interface PlanRecordWithRow extends PlanRecord {
  row: number;
}

export interface CreatePlanInput {
  planId: string;
  planName: string;
  monthlyPrice: number;
  speedMbps: number;
  planStatus: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePlanChanges {
  planName?: string;
  monthlyPrice?: number;
  speedMbps?: number;
  planStatus?: PlanStatus;
  updatedAt: string;
}

/**
 * Header-addressed Plans persistence adapter, following the same read/patch
 * shape as `sheet-auth-store.ts`. Never exposes raw Sheet row positions to
 * callers outside this module.
 */
export class PlansRepository {
  constructor(private readonly sheet: SpreadsheetSheet) {}

  list(): PlanRecord[] {
    return cells(this.sheet).map((row, index) => {
      const withRow = toRecord(row, index + 2);
      const record: PlanRecord = {
        planId: withRow.planId,
        planName: withRow.planName,
        monthlyPrice: withRow.monthlyPrice,
        speedMbps: withRow.speedMbps,
        planStatus: withRow.planStatus,
        createdAt: withRow.createdAt,
        updatedAt: withRow.updatedAt,
      };
      return record;
    });
  }

  findById(planId: string): PlanRecordWithRow | null {
    const rows = cells(this.sheet);
    for (let index = 0; index < rows.length; index += 1) {
      const record = toRecord(rows[index], index + 2);
      if (record.planId === planId) return record;
    }
    return null;
  }

  create(input: CreatePlanInput): void {
    this.sheet.appendRow([
      input.planId,
      input.planName,
      input.monthlyPrice,
      input.speedMbps,
      input.planStatus,
      input.createdAt,
      input.updatedAt,
    ]);
  }

  /** Caller must have already checked `updatedAt` against the client-supplied concurrency token. */
  update(existing: PlanRecordWithRow, changes: UpdatePlanChanges): PlanRecord {
    const next: PlanRecord = {
      planId: existing.planId,
      planName: changes.planName ?? existing.planName,
      monthlyPrice: changes.monthlyPrice ?? existing.monthlyPrice,
      speedMbps: changes.speedMbps ?? existing.speedMbps,
      planStatus: changes.planStatus ?? existing.planStatus,
      createdAt: existing.createdAt,
      updatedAt: changes.updatedAt,
    };
    this.sheet
      .getRange(existing.row, 1, 1, 7)
      .setValues([
        [
          next.planId,
          next.planName,
          next.monthlyPrice,
          next.speedMbps,
          next.planStatus,
          next.createdAt,
          next.updatedAt,
        ],
      ]);
    return next;
  }
}
