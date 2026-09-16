import { describe, expect, it } from "vitest";
import {
  AGGREGATE_RANGE_DAYS,
  buildDashboardAggregate,
} from "../core/dashboard-aggregate";
import type { ApplicationRecord } from "../core/contracts";
import { MemorySheet } from "./helpers";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const clock = { now: () => NOW };

function app(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    applicationId: overrides.applicationId ?? "app-1",
    customerFullName: "Customer",
    mobileNumber: "09171234567",
    email: "",
    completeAddress: "123 Street",
    barangay: "Barangay",
    cityMunicipality: "City",
    province: "Province",
    landmark: "",
    planId: "plan-1",
    planNameSnapshot: "Plan",
    monthlyPriceSnapshot: 999,
    agentId: overrides.agentId ?? "agent-1",
    processorId: overrides.processorId ?? "",
    currentStatus: overrides.currentStatus ?? "Pending",
    jobOrderNumber: "",
    submittedAt: overrides.submittedAt ?? NOW.toISOString(),
    installedAt: "",
    notes: "",
    version: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function statusHistorySheet(
  rows: readonly {
    applicationId: string;
    toStatus: string;
    occurredAt: string;
  }[],
): MemorySheet {
  const sheet = new MemorySheet();
  sheet.appendRow([
    "history_id",
    "application_id",
    "from_status",
    "to_status",
    "notes",
    "job_order_number",
    "actor_user_id",
    "request_id",
    "occurred_at",
  ]);
  for (const [index, row] of rows.entries()) {
    sheet.appendRow([
      `h-${index + 1}`,
      row.applicationId,
      "Pending",
      row.toStatus,
      "",
      "",
      "actor-1",
      "req-1",
      row.occurredAt,
    ]);
  }
  return sheet;
}

describe("buildDashboardAggregate", () => {
  it("returns exactly AGGREGATE_RANGE_DAYS zero-filled buckets for zero matching applications", () => {
    const result = buildDashboardAggregate(
      { kind: "admin" },
      [],
      new MemorySheet(),
      clock,
    );
    expect(result.buckets).toHaveLength(AGGREGATE_RANGE_DAYS);
    expect(result.rangeEndDate).toBe("2026-09-16");
    for (const bucket of result.buckets) {
      for (const value of Object.values(bucket.submittedCounts)) {
        expect(value).toBe(0);
      }
      for (const value of Object.values(bucket.statusChangeCounts)) {
        expect(value).toBe(0);
      }
    }
  });

  it("includes an application submitted exactly at the range start boundary", () => {
    const rangeStart = new Date(
      NOW.getTime() - (AGGREGATE_RANGE_DAYS - 1) * 86_400_000,
    ).toISOString();
    const result = buildDashboardAggregate(
      { kind: "admin" },
      [app({ submittedAt: rangeStart, currentStatus: "Pending" })],
      new MemorySheet(),
      clock,
    );
    const firstBucket = result.buckets[0];
    expect(firstBucket.date).toBe(result.rangeStartDate);
    expect(firstBucket.submittedCounts.Pending).toBe(1);
  });

  it("includes an application submitted exactly at the range end boundary (today)", () => {
    const result = buildDashboardAggregate(
      { kind: "admin" },
      [app({ submittedAt: NOW.toISOString(), currentStatus: "Installed" })],
      new MemorySheet(),
      clock,
    );
    const lastBucket = result.buckets[result.buckets.length - 1];
    expect(lastBucket.date).toBe(result.rangeEndDate);
    expect(lastBucket.submittedCounts.Installed).toBe(1);
  });

  it("excludes an application submitted exactly one day before the range start", () => {
    const justOutside = new Date(
      NOW.getTime() - AGGREGATE_RANGE_DAYS * 86_400_000,
    ).toISOString();
    const result = buildDashboardAggregate(
      { kind: "admin" },
      [app({ submittedAt: justOutside })],
      new MemorySheet(),
      clock,
    );
    const total = result.buckets.reduce(
      (sum, bucket) =>
        sum + Object.values(bucket.submittedCounts).reduce((a, b) => a + b, 0),
      0,
    );
    expect(total).toBe(0);
  });

  it("scopes an Agent to only their own applications (no cross-agent leakage)", () => {
    const apps = [
      app({ applicationId: "a1", agentId: "agent-A" }),
      app({ applicationId: "a2", agentId: "agent-B" }),
    ];
    const result = buildDashboardAggregate(
      { kind: "agent", agentId: "agent-A" },
      apps,
      new MemorySheet(),
      clock,
    );
    const total = result.buckets.reduce(
      (sum, bucket) =>
        sum + Object.values(bucket.submittedCounts).reduce((a, b) => a + b, 0),
      0,
    );
    expect(total).toBe(1);
  });

  it("scopes a Processor to only their assigned applications", () => {
    const apps = [
      app({ applicationId: "a1", processorId: "proc-A" }),
      app({ applicationId: "a2", processorId: "proc-B" }),
    ];
    const result = buildDashboardAggregate(
      { kind: "processor", processorId: "proc-A" },
      apps,
      new MemorySheet(),
      clock,
    );
    const total = result.buckets.reduce(
      (sum, bucket) =>
        sum + Object.values(bucket.submittedCounts).reduce((a, b) => a + b, 0),
      0,
    );
    expect(total).toBe(1);
  });

  it("Admin sees the global aggregate across all agents/processors", () => {
    const apps = [
      app({ applicationId: "a1", agentId: "agent-A" }),
      app({ applicationId: "a2", agentId: "agent-B" }),
    ];
    const result = buildDashboardAggregate(
      { kind: "admin" },
      apps,
      new MemorySheet(),
      clock,
    );
    const total = result.buckets.reduce(
      (sum, bucket) =>
        sum + Object.values(bucket.submittedCounts).reduce((a, b) => a + b, 0),
      0,
    );
    expect(total).toBe(2);
  });

  it("produces exact expected bucketed counts from a small deterministic fixture", () => {
    const apps = [
      app({
        applicationId: "a1",
        agentId: "agent-A",
        currentStatus: "Pending",
        submittedAt: NOW.toISOString(),
      }),
      app({
        applicationId: "a2",
        agentId: "agent-A",
        currentStatus: "Installed",
        submittedAt: NOW.toISOString(),
      }),
    ];
    const history = statusHistorySheet([
      {
        applicationId: "a1",
        toStatus: "Transmitted",
        occurredAt: NOW.toISOString(),
      },
      {
        applicationId: "a2",
        toStatus: "Installed",
        occurredAt: NOW.toISOString(),
      },
      // Different agent's application -- must never leak into agent-A's scope.
      {
        applicationId: "a3",
        toStatus: "Installed",
        occurredAt: NOW.toISOString(),
      },
    ]);
    const result = buildDashboardAggregate(
      { kind: "agent", agentId: "agent-A" },
      apps,
      history,
      clock,
    );
    const lastBucket = result.buckets[result.buckets.length - 1];
    expect(lastBucket.submittedCounts.Pending).toBe(1);
    expect(lastBucket.submittedCounts.Installed).toBe(1);
    expect(lastBucket.statusChangeCounts.Transmitted).toBe(1);
    expect(lastBucket.statusChangeCounts.Installed).toBe(1);
  });

  it("excludes a Status_History row for an application outside the caller's scope", () => {
    const apps = [app({ applicationId: "a1", agentId: "agent-A" })];
    const history = statusHistorySheet([
      {
        applicationId: "a1",
        toStatus: "Installed",
        occurredAt: NOW.toISOString(),
      },
      {
        applicationId: "unowned",
        toStatus: "Installed",
        occurredAt: NOW.toISOString(),
      },
    ]);
    const result = buildDashboardAggregate(
      { kind: "agent", agentId: "agent-A" },
      apps,
      history,
      clock,
    );
    const lastBucket = result.buckets[result.buckets.length - 1];
    expect(lastBucket.statusChangeCounts.Installed).toBe(1);
  });

  it("ignores a Status_History row outside the bounded date range", () => {
    const apps = [app({ applicationId: "a1", agentId: "agent-A" })];
    const tooOld = new Date(
      NOW.getTime() - (AGGREGATE_RANGE_DAYS + 5) * 86_400_000,
    ).toISOString();
    const history = statusHistorySheet([
      { applicationId: "a1", toStatus: "Installed", occurredAt: tooOld },
    ]);
    const result = buildDashboardAggregate(
      { kind: "agent", agentId: "agent-A" },
      apps,
      history,
      clock,
    );
    const total = result.buckets.reduce(
      (sum, bucket) =>
        sum +
        Object.values(bucket.statusChangeCounts).reduce((a, b) => a + b, 0),
      0,
    );
    expect(total).toBe(0);
  });
});
