import { useEffect, useState } from "react";

import {
  fetchAllApplications,
  fetchAllUsers,
  fetchDashboardAggregate,
  DataApiError,
  type ApplicationSummary,
  type DashboardAggregateResult,
  type UserSummary,
} from "@/data/applications-api";
import type {
  DashboardState,
  Metric,
  StatusBreakdown,
  TrendPoint,
} from "@/types/dashboard";
import type { Role } from "@/types/roles";
import {
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";

export interface DashboardApplicationRow {
  readonly applicationId: string;
  readonly customer: string;
  readonly address: string;
  readonly agentId: string;
  readonly processorId: string;
  readonly status: string;
  readonly date: string;
  readonly plan: string;
}

export interface DashboardDataResult {
  readonly state: DashboardState;
  readonly metrics: readonly Metric[];
  readonly statusBreakdown: readonly StatusBreakdown[];
  readonly rows: readonly DashboardApplicationRow[];
  /** Present only for Admin: total distinct Agents/Processors for quick stats. */
  readonly agentCount?: number;
  readonly processorCount?: number;
  /**
   * Agent's multi-status "My Applications" trend chart input, derived from
   * the live GET /api/applications/aggregate endpoint (D-047). Empty array
   * while loading/erroring, never undefined -- the frozen chart component
   * renders an empty series safely.
   */
  readonly trend: readonly TrendPoint[];
  /**
   * Processor's daily productivity chart input (count of status changes
   * landing "Installed" per day), derived from the same live aggregate.
   */
  readonly productivity: readonly { label: string; applications: number }[];
}

function toRow(app: ApplicationSummary): DashboardApplicationRow {
  return {
    applicationId: app.applicationId,
    customer: app.customerFullName,
    address: `${app.cityMunicipality}, ${app.province}`,
    agentId: app.agentId,
    processorId: app.processorId,
    status: app.currentStatus,
    date: new Date(app.submittedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    plan: app.planNameSnapshot,
  };
}

function count(apps: readonly ApplicationSummary[], status: string): number {
  return apps.filter((a) => a.currentStatus === status).length;
}

function buildMetrics(
  role: Role,
  apps: readonly ApplicationSummary[],
): readonly Metric[] {
  if (role === "admin") {
    return [
      {
        label: "Total Applications",
        value: String(apps.length),
        detail: "All applications",
        tone: "blue",
        icon: FileText,
      },
      {
        label: "Pending",
        value: String(count(apps, "Pending")),
        detail: "Awaiting action",
        tone: "amber",
        icon: Clock3,
      },
      {
        label: "With Job Order",
        value: String(count(apps, "With Job Order")),
        detail: "Ready to move",
        tone: "blue",
        icon: FileText,
      },
      {
        label: "Ongoing",
        value: String(count(apps, "Ongoing")),
        detail: "In progress",
        tone: "indigo",
        icon: Settings2,
      },
      {
        label: "Installed",
        value: String(count(apps, "Installed")),
        detail: "Completed",
        tone: "green",
        icon: CheckCircle2,
      },
    ];
  }
  if (role === "agent") {
    return [
      {
        label: "My Applications",
        value: String(apps.length),
        detail: "Total submissions",
        tone: "blue",
        icon: FileText,
      },
      {
        label: "Pending",
        value: String(count(apps, "Pending")),
        detail: "Awaiting processing",
        tone: "amber",
        icon: Clock3,
      },
      {
        label: "Ongoing",
        value: String(count(apps, "Ongoing")),
        detail: "In progress",
        tone: "blue",
        icon: RefreshCw,
      },
      {
        label: "Installed",
        value: String(count(apps, "Installed")),
        detail: "Successfully completed",
        tone: "green",
        icon: CheckCircle2,
      },
      {
        label: "Cancelled",
        value: String(count(apps, "Cancelled/Rejected")),
        detail: "Did not proceed",
        tone: "red",
        icon: XCircle,
      },
    ];
  }
  return [
    {
      label: "Assigned Applications",
      value: String(apps.length),
      detail: "Assigned to you",
      tone: "blue",
      icon: FileText,
    },
    {
      label: "For Processing",
      value: String(count(apps, "Pending") + count(apps, "Transmitted")),
      detail: "Needs attention",
      tone: "amber",
      icon: Clock3,
    },
    {
      label: "With Job Order",
      value: String(count(apps, "With Job Order")),
      detail: "Ready to move",
      tone: "blue",
      icon: FileText,
    },
    {
      label: "Ongoing",
      value: String(count(apps, "Ongoing")),
      detail: "In progress",
      tone: "indigo",
      icon: RefreshCw,
    },
    {
      label: "Installed",
      value: String(count(apps, "Installed")),
      detail: "Completed",
      tone: "green",
      icon: CheckCircle2,
    },
  ];
}

function buildStatusBreakdown(
  role: Role,
  apps: readonly ApplicationSummary[],
): readonly StatusBreakdown[] {
  if (role === "agent") {
    return [
      { label: "Pending", value: count(apps, "Pending"), tone: "amber" },
      { label: "Ongoing", value: count(apps, "Ongoing"), tone: "blue" },
      { label: "Installed", value: count(apps, "Installed"), tone: "green" },
      {
        label: "Cancelled",
        value: count(apps, "Cancelled/Rejected"),
        tone: "red",
      },
    ];
  }
  return [
    { label: "Pending", value: count(apps, "Pending"), tone: "amber" },
    {
      label: "With Job Order",
      value: count(apps, "With Job Order"),
      tone: "blue",
    },
    { label: "Ongoing", value: count(apps, "Ongoing"), tone: "indigo" },
    { label: "Installed", value: count(apps, "Installed"), tone: "green" },
  ];
}

function shortDayLabel(dateKey: string): string {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Derives the Agent multi-status trend chart's TrendPoint[] shape from the
 * live aggregate's submittedCounts buckets (D-047, replacing the previously
 * illustrative agentTrend fixture).
 */
function buildAgentTrend(
  aggregate: DashboardAggregateResult | null,
): readonly TrendPoint[] {
  if (aggregate === null) return [];
  return aggregate.buckets.map((bucket) => ({
    label: shortDayLabel(bucket.date),
    applications:
      bucket.submittedCounts.Pending +
      bucket.submittedCounts.Transmitted +
      bucket.submittedCounts["With Job Order"] +
      bucket.submittedCounts.Ongoing +
      bucket.submittedCounts.Installed +
      bucket.submittedCounts.Delayed +
      bucket.submittedCounts["Cancelled/Rejected"],
    pending: bucket.submittedCounts.Pending,
    ongoing: bucket.submittedCounts.Ongoing,
    installed: bucket.submittedCounts.Installed,
    cancelled: bucket.submittedCounts["Cancelled/Rejected"],
  }));
}

/**
 * Derives the Processor daily productivity chart's {label, applications}[]
 * shape from the live aggregate's statusChangeCounts buckets (count of
 * status changes landing "Installed" per day), replacing the previously
 * illustrative processorProductivity fixture (D-047).
 */
function buildProductivity(
  aggregate: DashboardAggregateResult | null,
): readonly { label: string; applications: number }[] {
  if (aggregate === null) return [];
  return aggregate.buckets.map((bucket) => ({
    label: shortDayLabel(bucket.date),
    applications: bucket.statusChangeCounts.Installed,
  }));
}

/**
 * Fetches live data for the given role's dashboard and derives the exact
 * aggregate shapes the frozen dashboard components already render (Metric,
 * StatusBreakdown, table rows, and now the trend/productivity chart series
 * via GET /api/applications/aggregate) -- a data-source swap only, never a
 * redesign. Row-level scoping (an Agent only ever seeing their own
 * applications, a Processor only their assigned ones) is enforced
 * authoritatively by Apps Script from the session; this hook never
 * re-filters or trusts any client-side identity for authorization.
 */
export function useDashboardData(role: Role): DashboardDataResult {
  const [state, setState] = useState<DashboardState>("loading");
  const [apps, setApps] = useState<readonly ApplicationSummary[]>([]);
  const [users, setUsers] = useState<readonly UserSummary[]>([]);
  const [aggregate, setAggregate] = useState<DashboardAggregateResult | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const applications = await fetchAllApplications();
        let allUsers: readonly UserSummary[] = [];
        if (role === "admin") {
          try {
            allUsers = await fetchAllUsers();
          } catch {
            // Admin quick-stats (agent/processor counts) are supplementary;
            // a failure here never blocks rendering the applications data.
          }
        }
        let liveAggregate: DashboardAggregateResult | null = null;
        try {
          liveAggregate = await fetchDashboardAggregate();
        } catch {
          // The trend/productivity aggregate is supplementary to the core
          // dashboard data; a failure here never blocks rendering the rest
          // of the dashboard. The chart simply renders an empty series.
        }
        if (cancelled) return;
        setApps(applications);
        setUsers(allUsers);
        setAggregate(liveAggregate);
        setState(applications.length === 0 ? "empty" : "populated");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DataApiError && error.code === "NOT_FOUND") {
          setState("empty");
          return;
        }
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const metrics = buildMetrics(role, apps);
  const statusBreakdown = buildStatusBreakdown(role, apps);
  const rows = apps
    .slice()
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
    .slice(0, 10)
    .map(toRow);

  return {
    state,
    metrics,
    statusBreakdown,
    rows,
    trend: buildAgentTrend(aggregate),
    productivity: buildProductivity(aggregate),
    agentCount:
      role === "admin"
        ? users.filter((u) => u.role === "Agent").length
        : undefined,
    processorCount:
      role === "admin"
        ? users.filter((u) => u.role === "Processor").length
        : undefined,
  };
}
