import { useEffect, useState } from "react";

import {
  fetchAllApplications,
  fetchAllUsers,
  DataApiError,
  type ApplicationSummary,
  type UserSummary,
} from "@/data/applications-api";
import type {
  DashboardState,
  Metric,
  StatusBreakdown,
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

/**
 * Fetches live data for the given role's dashboard and derives the exact
 * aggregate shapes the frozen dashboard components already render (Metric,
 * StatusBreakdown, table rows) -- a data-source swap only, never a redesign.
 * Row-level scoping (an Agent only ever seeing their own applications, a
 * Processor only their assigned ones) is enforced authoritatively by Apps
 * Script from the session; this hook never re-filters or trusts any
 * client-side identity for authorization.
 */
export function useDashboardData(role: Role): DashboardDataResult {
  const [state, setState] = useState<DashboardState>("loading");
  const [apps, setApps] = useState<readonly ApplicationSummary[]>([]);
  const [users, setUsers] = useState<readonly UserSummary[]>([]);

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
        if (cancelled) return;
        setApps(applications);
        setUsers(allUsers);
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
