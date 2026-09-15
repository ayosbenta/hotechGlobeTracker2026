import type { ApplicationRecord, ApplicationStatus } from "./contracts";
import { STATUS_VALUES } from "./contracts";
import type { SpreadsheetSheet } from "./schema";

export function isApplicationStatus(
  value: unknown,
): value is ApplicationStatus {
  return (
    typeof value === "string" &&
    (STATUS_VALUES as readonly string[]).includes(value)
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

export interface ApplicationRecordWithRow extends ApplicationRecord {
  row: number;
}

const COLUMN_COUNT = 22;

function toRecord(
  row: unknown[],
  rowPosition: number,
): ApplicationRecordWithRow {
  return {
    applicationId: text(row[0]),
    customerFullName: text(row[1]),
    mobileNumber: text(row[2]),
    email: text(row[3]),
    completeAddress: text(row[4]),
    barangay: text(row[5]),
    cityMunicipality: text(row[6]),
    province: text(row[7]),
    landmark: text(row[8]),
    planId: text(row[9]),
    planNameSnapshot: text(row[10]),
    monthlyPriceSnapshot: number(row[11]),
    agentId: text(row[12]),
    processorId: text(row[13]),
    currentStatus: isApplicationStatus(row[14]) ? row[14] : "Pending",
    jobOrderNumber: text(row[15]),
    submittedAt: text(row[16]),
    installedAt: text(row[17]),
    notes: text(row[18]),
    version: number(row[19]),
    createdAt: text(row[20]),
    updatedAt: text(row[21]),
    row: rowPosition,
  };
}

export function stripApplicationRow(
  record: ApplicationRecordWithRow,
): ApplicationRecord {
  return stripRow(record);
}

function stripRow(record: ApplicationRecordWithRow): ApplicationRecord {
  return {
    applicationId: record.applicationId,
    customerFullName: record.customerFullName,
    mobileNumber: record.mobileNumber,
    email: record.email,
    completeAddress: record.completeAddress,
    barangay: record.barangay,
    cityMunicipality: record.cityMunicipality,
    province: record.province,
    landmark: record.landmark,
    planId: record.planId,
    planNameSnapshot: record.planNameSnapshot,
    monthlyPriceSnapshot: record.monthlyPriceSnapshot,
    agentId: record.agentId,
    processorId: record.processorId,
    currentStatus: record.currentStatus,
    jobOrderNumber: record.jobOrderNumber,
    submittedAt: record.submittedAt,
    installedAt: record.installedAt,
    notes: record.notes,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toRow(record: ApplicationRecord): unknown[] {
  return [
    record.applicationId,
    record.customerFullName,
    record.mobileNumber,
    record.email,
    record.completeAddress,
    record.barangay,
    record.cityMunicipality,
    record.province,
    record.landmark,
    record.planId,
    record.planNameSnapshot,
    record.monthlyPriceSnapshot,
    record.agentId,
    record.processorId,
    record.currentStatus,
    record.jobOrderNumber,
    record.submittedAt,
    record.installedAt,
    record.notes,
    record.version,
    record.createdAt,
    record.updatedAt,
  ];
}

export interface ApplicationsListFilter {
  agentId?: string;
  processorId?: string;
  currentStatus?: ApplicationStatus;
}

export interface UpdateApplicationChanges {
  customerFullName?: string;
  mobileNumber?: string;
  email?: string;
  completeAddress?: string;
  barangay?: string;
  cityMunicipality?: string;
  province?: string;
  landmark?: string;
  planId?: string;
  planNameSnapshot?: string;
  monthlyPriceSnapshot?: number;
  agentId?: string;
  processorId?: string;
  currentStatus?: ApplicationStatus;
  jobOrderNumber?: string;
  submittedAt?: string;
  installedAt?: string;
  notes?: string;
  version: number;
  updatedAt: string;
}

/**
 * Header-addressed Applications persistence adapter over the frozen
 * 22-column `Applications` sheet. Never exposes raw Sheet row positions to
 * callers outside this module. All role/ownership filtering (agent's own,
 * processor's assigned) happens here against the authoritative actor
 * userId — never trusting a client-supplied agent_id/processor_id filter as
 * authorization.
 */
export class ApplicationsRepository {
  constructor(private readonly sheet: SpreadsheetSheet) {}

  list(filter: ApplicationsListFilter = {}): ApplicationRecord[] {
    return cells(this.sheet)
      .map((row, index) => toRecord(row, index + 2))
      .filter(
        (record) =>
          filter.agentId === undefined || record.agentId === filter.agentId,
      )
      .filter(
        (record) =>
          filter.processorId === undefined ||
          record.processorId === filter.processorId,
      )
      .filter(
        (record) =>
          filter.currentStatus === undefined ||
          record.currentStatus === filter.currentStatus,
      )
      .map(stripRow);
  }

  findById(applicationId: string): ApplicationRecordWithRow | null {
    const rows = cells(this.sheet);
    for (let index = 0; index < rows.length; index += 1) {
      const record = toRecord(rows[index], index + 2);
      if (record.applicationId === applicationId) return record;
    }
    return null;
  }

  create(record: ApplicationRecord): void {
    this.sheet.appendRow(toRow(record));
  }

  /** Caller must have already checked `version` via assertCurrentVersion. */
  update(
    existing: ApplicationRecordWithRow,
    changes: UpdateApplicationChanges,
  ): ApplicationRecord {
    const next: ApplicationRecord = {
      applicationId: existing.applicationId,
      customerFullName: changes.customerFullName ?? existing.customerFullName,
      mobileNumber: changes.mobileNumber ?? existing.mobileNumber,
      email: changes.email ?? existing.email,
      completeAddress: changes.completeAddress ?? existing.completeAddress,
      barangay: changes.barangay ?? existing.barangay,
      cityMunicipality: changes.cityMunicipality ?? existing.cityMunicipality,
      province: changes.province ?? existing.province,
      landmark: changes.landmark ?? existing.landmark,
      planId: changes.planId ?? existing.planId,
      planNameSnapshot: changes.planNameSnapshot ?? existing.planNameSnapshot,
      monthlyPriceSnapshot:
        changes.monthlyPriceSnapshot ?? existing.monthlyPriceSnapshot,
      agentId: changes.agentId ?? existing.agentId,
      processorId: changes.processorId ?? existing.processorId,
      currentStatus: changes.currentStatus ?? existing.currentStatus,
      jobOrderNumber: changes.jobOrderNumber ?? existing.jobOrderNumber,
      submittedAt: changes.submittedAt ?? existing.submittedAt,
      installedAt: changes.installedAt ?? existing.installedAt,
      notes: changes.notes ?? existing.notes,
      version: changes.version,
      createdAt: existing.createdAt,
      updatedAt: changes.updatedAt,
    };
    this.sheet
      .getRange(existing.row, 1, 1, COLUMN_COUNT)
      .setValues([toRow(next)]);
    return next;
  }
}
