import type {
  ApplicationRecord,
  ApplicationStatus,
  Clock,
  DashboardAggregateBucket,
  DashboardAggregateResult,
} from "./contracts";
import { STATUS_VALUES } from "./contracts";
import type { SpreadsheetSheet } from "./schema";
import { isApplicationStatus } from "./applications-repository";

/**
 * MVP-3 fix (D-047): fixed, bounded date range for the dashboard trend
 * aggregate. 14 trailing UTC calendar days (today inclusive), matching the
 * two frozen chart components' existing fixture shapes (an Agent's
 * multi-status trend and a Processor's daily productivity chart), which
 * both render a short, fixed-length series -- never an unbounded or
 * client-supplied range.
 */
export const AGGREGATE_RANGE_DAYS = 14;

/**
 * D-047: this Sheets/Apps Script backend has no established timezone
 * convention (confirmed by a repo-wide search for "Manila"/timeZone/
 * Intl.DateTimeFormat usage before this decision — none exists). UTC
 * calendar-day bucketing is therefore the deterministic default: every
 * timestamp is bucketed by its UTC date, independent of server or caller
 * local time.
 */
function utcDateKey(isoTimestamp: string): string | null {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function zeroCounts(): Record<ApplicationStatus, number> {
  const counts = {} as Record<ApplicationStatus, number>;
  for (const status of STATUS_VALUES) counts[status] = 0;
  return counts;
}

/** Builds the fixed 14-day (inclusive) UTC calendar-day range ending "today". */
function buildRangeDates(now: Date): readonly string[] {
  const endKey = now.toISOString().slice(0, 10);
  const end = new Date(`${endKey}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let offset = AGGREGATE_RANGE_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(end.getTime() - offset * 86_400_000);
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

export interface StatusHistoryRow {
  applicationId: string;
  toStatus: string;
  occurredAt: string;
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

/**
 * Reads Status_History rows for the given application IDs (a Set for O(1)
 * membership), following the frozen Status_History column order:
 * history_id, application_id, from_status, to_status, notes,
 * job_order_number, actor_user_id, request_id, occurred_at.
 */
function readStatusHistory(
  sheet: SpreadsheetSheet,
  applicationIds: ReadonlySet<string>,
): StatusHistoryRow[] {
  const rows: StatusHistoryRow[] = [];
  for (const row of cells(sheet)) {
    const applicationId = text(row[1]);
    if (!applicationIds.has(applicationId)) continue;
    rows.push({
      applicationId,
      toStatus: text(row[3]),
      occurredAt: text(row[8]),
    });
  }
  return rows;
}

export type AggregateScope =
  | { kind: "admin" }
  | { kind: "agent"; agentId: string }
  | { kind: "processor"; processorId: string };

/**
 * Row-level scoping mirrors listApplications' authoritative filtering in
 * crud-domain.ts: Admin sees every application; Agent only their own
 * (agent_id = session userId); Processor only their assigned applications
 * (processor_id = session userId). Never trusts a client-supplied identity.
 */
function scopedApplications(
  all: readonly ApplicationRecord[],
  scope: AggregateScope,
): readonly ApplicationRecord[] {
  if (scope.kind === "admin") return all;
  if (scope.kind === "agent")
    return all.filter((app) => app.agentId === scope.agentId);
  return all.filter((app) => app.processorId === scope.processorId);
}

/**
 * Builds the bounded, role-scoped, zero-filled daily aggregate both dashboard
 * trend charts need. Never includes raw customer/contact fields — only
 * counts bucketed by UTC calendar day. A role/date-range with zero matching
 * applications still returns a fully zero-filled series for every day in the
 * range, never an error and never a sparse/partial shape.
 */
export function buildDashboardAggregate(
  scope: AggregateScope,
  applications: readonly ApplicationRecord[],
  statusHistorySheet: SpreadsheetSheet,
  clock: Clock,
): DashboardAggregateResult {
  const rangeDates = buildRangeDates(clock.now());
  const rangeStartDate = rangeDates[0];
  const rangeEndDate = rangeDates[rangeDates.length - 1];
  const rangeSet = new Set(rangeDates);

  const scoped = scopedApplications(applications, scope);
  const scopedIds = new Set(scoped.map((app) => app.applicationId));

  const buckets = new Map<string, DashboardAggregateBucket>();
  for (const date of rangeDates) {
    buckets.set(date, {
      date,
      submittedCounts: zeroCounts(),
      statusChangeCounts: zeroCounts(),
    });
  }

  // Agent trend chart input: submission-day counts bucketed by the
  // application's *current* status (a simple, deterministic snapshot -- the
  // frozen schema has no per-day historical status column to reconstruct a
  // true point-in-time breakdown without reimplementing transition logic).
  for (const app of scoped) {
    const key = utcDateKey(app.submittedAt);
    if (key === null || !rangeSet.has(key)) continue;
    const bucket = buckets.get(key);
    if (bucket === undefined) continue;
    bucket.submittedCounts[app.currentStatus] += 1;
  }

  // Processor productivity chart input: count of Status_History rows whose
  // to_status landed on each UTC day, scoped to this caller's applications
  // only. Reuses the frozen Status_History schema/columns directly; no
  // transition logic is reimplemented here.
  if (scopedIds.size > 0) {
    const historyRows = readStatusHistory(statusHistorySheet, scopedIds);
    for (const row of historyRows) {
      const key = utcDateKey(row.occurredAt);
      if (key === null || !rangeSet.has(key)) continue;
      if (!isApplicationStatus(row.toStatus)) continue;
      const bucket = buckets.get(key);
      if (bucket === undefined) continue;
      bucket.statusChangeCounts[row.toStatus] += 1;
    }
  }

  return {
    rangeStartDate,
    rangeEndDate,
    buckets: rangeDates.map((date) => buckets.get(date)!),
  };
}
