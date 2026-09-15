import { CalendarDays, CirclePlus, Filter, TrendingUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  chartTooltipStyle,
  dashboardColors,
} from "@/components/dashboard/chart-styles";
import {
  ChartLegend,
  DashboardCard,
  DashboardStateView,
  FilterBar,
  MetricCard,
  SectionHeading,
  SelectAffordance,
  StatusBadge,
  StatusDonut,
  TableAction,
} from "@/components/dashboard/dashboard-ui";
import { Button } from "@/components/ui/button";
import { agentTrend, processorProductivity } from "@/data/dashboard-mocks";
import {
  useDashboardData,
  type DashboardApplicationRow,
  type DashboardDataResult,
} from "@/data/use-dashboard-data";
import { cn } from "@/lib/utils";
import type { Metric, TrendPoint } from "@/types/dashboard";
import { resolveDashboardState } from "@/lib/dashboard-state";
import type { Role } from "@/types/roles";

interface DashboardPageProps {
  readonly role: Role;
}

function PageTitle({
  children,
  description,
  aside,
}: {
  readonly children: string;
  readonly description: string;
  readonly aside?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#07183f] sm:text-[32px]">
          {children}
        </h1>
        <p className="mt-1 text-sm text-[#60749a] sm:text-base">
          {description}
        </p>
      </div>
      {aside}
    </div>
  );
}

function TrendChart({
  data,
  lines,
}: {
  readonly data: readonly TrendPoint[];
  readonly lines: readonly {
    readonly dataKey: string;
    readonly color: string;
  }[];
}) {
  return (
    <div className="h-[250px] min-w-0 px-2 pb-1 sm:h-[270px]">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart
          data={data}
          margin={{ top: 16, right: 12, left: -16, bottom: 2 }}
        >
          <CartesianGrid
            stroke="#e4edf8"
            strokeDasharray="0"
            vertical={false}
          />
          <XAxis
            axisLine={false}
            dataKey="label"
            fontSize={11}
            stroke="#667a9f"
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            fontSize={11}
            stroke="#667a9f"
            tickLine={false}
          />
          <Tooltip contentStyle={chartTooltipStyle} />
          {lines.map((line) => (
            <Line
              activeDot={{ r: 5 }}
              dataKey={line.dataKey}
              dot={{ r: 4 }}
              isAnimationActive={false}
              key={line.dataKey}
              stroke={line.color}
              strokeWidth={3}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Builds a monthly trend series from live application submission dates.
 * This is a data-source swap of the mocked "Monthly Applications" chart
 * only -- same shape, same chart component, no layout change.
 */
function monthlyTrendFromRows(
  rows: readonly DashboardApplicationRow[],
): readonly TrendPoint[] {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const parsed = new Date(row.date);
    if (Number.isNaN(parsed.getTime())) continue;
    const label = parsed.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    byMonth.set(label, (byMonth.get(label) ?? 0) + 1);
  }
  return Array.from(byMonth.entries()).map(([label, applications]) => ({
    label,
    applications,
  }));
}

function AdminDashboard({ data }: { readonly data: DashboardDataResult }) {
  const trend = monthlyTrendFromRows(data.rows);
  return (
    <>
      <PageTitle description="Here's what's happening with your applications today.">
        Good morning, Admin!
      </PageTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <DashboardCard className="min-w-0 xl:col-span-3">
          <SectionHeading
            actions={<SelectAffordance label="Recent Activity" />}
            title="Monthly Applications"
          />
          <TrendChart
            data={trend}
            lines={[{ dataKey: "applications", color: dashboardColors.blue }]}
          />
        </DashboardCard>
        <DashboardCard className="min-w-0 xl:col-span-2">
          <SectionHeading
            actions={<SelectAffordance label="All Time" />}
            title="Application Status"
          />
          <StatusDonut data={data.statusBreakdown} />
        </DashboardCard>
      </div>
      <DashboardCard className="mt-5 overflow-hidden">
        <SectionHeading
          actions={<FilterBar includeDate />}
          title="Recent Applications"
        />
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-[#f4f8fd] text-xs font-semibold text-[#405779]">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Processor</th>
                <th className="px-4 py-3">Application Status</th>
                <th className="px-4 py-3">Date Applied</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e4edf7] text-[#24395f]">
              {data.rows.map((application, index) => (
                <tr key={application.applicationId}>
                  <td className="px-4 py-3.5 text-[#5b7196]">{index + 1}</td>
                  <td className="px-4 py-3.5 font-medium">
                    {application.customer}
                  </td>
                  <td className="px-4 py-3.5 text-[#536b91]">
                    {application.address}
                  </td>
                  <td className="px-4 py-3.5">{application.agentId || "—"}</td>
                  <td className="px-4 py-3.5">
                    {application.processorId || "Unassigned"}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={application.status} />
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-[#536b91]">
                    {application.date}
                  </td>
                  <td className="px-4 py-2">
                    <TableAction />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#e4edf7] md:hidden">
          {data.rows.map((application) => (
            <article className="p-4" key={application.applicationId}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{application.customer}</h3>
                  <p className="mt-1 text-xs text-[#62769a]">
                    {application.address}
                  </p>
                </div>
                <StatusBadge status={application.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-[#7183a3]">Agent</dt>
                  <dd className="mt-0.5 font-medium">
                    {application.agentId || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#7183a3]">Processor</dt>
                  <dd className="mt-0.5 font-medium">
                    {application.processorId || "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#7183a3]">Applied</dt>
                  <dd className="mt-0.5 font-medium">{application.date}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </DashboardCard>
    </>
  );
}

function AgentDashboard({ data }: { readonly data: DashboardDataResult }) {
  return (
    <>
      <PageTitle
        aside={
          <Button
            className="min-h-11 bg-[#0879ea] px-5 shadow-lg shadow-blue-200 hover:bg-blue-700"
            type="button"
          >
            <CirclePlus aria-hidden="true" className="mr-2 size-5" />
            Add New Application
          </Button>
        }
        description="Here's a quick overview of your Globe Fiber applications."
      >
        Good morning, Maria!
      </PageTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <DashboardCard className="min-w-0 xl:col-span-2">
          <SectionHeading
            eyebrow="Status breakdown of your applications"
            title="Application Progress"
          />
          <StatusDonut data={data.statusBreakdown} />
        </DashboardCard>
        <DashboardCard className="min-w-0 xl:col-span-3">
          <SectionHeading
            actions={<SelectAffordance label="Last 6 months" />}
            eyebrow="Track the status of your submissions"
            title="My Applications"
          />
          {/* Historical multi-status trend requires server-side time-series
              aggregation not yet exposed by the API; kept on illustrative
              fixture data until that endpoint exists (documented MVP-3
              limitation, not a mocked production data path). */}
          <TrendChart
            data={agentTrend}
            lines={[
              { dataKey: "pending", color: dashboardColors.amber },
              { dataKey: "ongoing", color: dashboardColors.blue },
              { dataKey: "installed", color: dashboardColors.green },
              { dataKey: "cancelled", color: dashboardColors.red },
            ]}
          />
          <ChartLegend
            items={[
              { label: "Pending", color: dashboardColors.amber },
              { label: "Ongoing", color: dashboardColors.blue },
              { label: "Installed", color: dashboardColors.green },
              { label: "Cancelled", color: dashboardColors.red },
            ]}
          />
        </DashboardCard>
      </div>
      <DashboardCard className="mt-5 overflow-hidden">
        <SectionHeading
          actions={<FilterBar />}
          eyebrow="Your latest application submissions"
          title="Recent Submissions"
        />
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-[#f4f8fd] text-xs font-semibold text-[#405779]">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date Submitted</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e4edf7] text-[#24395f]">
              {data.rows.map((submission, index) => (
                <tr key={submission.applicationId}>
                  <td className="px-4 py-3.5 text-[#5b7196]">{index + 1}</td>
                  <td className="px-4 py-3.5 font-medium">
                    {submission.customer}
                  </td>
                  <td className="px-4 py-3.5 text-[#536b91]">
                    {submission.plan}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={submission.status} />
                  </td>
                  <td className="px-4 py-3.5 text-[#536b91]">
                    {submission.date}
                  </td>
                  <td className="px-4 py-2">
                    <TableAction />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#e4edf7] md:hidden">
          {data.rows.map((submission) => (
            <article
              className="flex items-start justify-between gap-3 p-4"
              key={submission.applicationId}
            >
              <div>
                <h3 className="font-bold">{submission.customer}</h3>
                <p className="mt-1 text-sm text-[#617497]">{submission.plan}</p>
                <p className="mt-2 text-xs text-[#7183a3]">
                  Submitted {submission.date}
                </p>
              </div>
              <StatusBadge status={submission.status} />
            </article>
          ))}
        </div>
      </DashboardCard>
    </>
  );
}

function ProcessorDashboard({ data }: { readonly data: DashboardDataResult }) {
  const quickStatMetrics: readonly Metric[] = data.metrics.slice(1);
  return (
    <>
      <PageTitle
        aside={
          <div className="flex items-center gap-3">
            <div className="hidden rounded-lg bg-[#e9f5ff] px-4 py-3 text-sm text-[#35537c] sm:block">
              <CalendarDays
                aria-hidden="true"
                className="mr-2 inline size-5 text-blue-700"
              />
              <span className="font-semibold">Today</span>
              <span className="ml-2">
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <p className="hidden border-b-2 border-blue-400 pb-2 text-sm font-medium italic text-blue-600 xl:block">
              More connections.
              <br />
              Brighter every day.
            </p>
          </div>
        }
        description="Process applications, track progress, and help more homes get connected."
      >
        Dashboard
      </PageTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <DashboardCard className="min-w-0 overflow-hidden">
          <SectionHeading
            actions={
              <div className="flex flex-wrap gap-2">
                <SelectAffordance label="Priority Queue" />
                <button
                  aria-label="Filter priority queue"
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-[#d2dfef] text-[#466185] hover:bg-blue-50"
                  type="button"
                >
                  <Filter aria-hidden="true" className="size-4" />
                </button>
                <SelectAffordance label="All Status" />
              </div>
            }
            eyebrow="Applications that need immediate attention."
            title="Priority Queue"
          />
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[800px] border-collapse text-left text-xs">
              <thead className="bg-[#f4f8fd] text-xs font-semibold text-[#405779]">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Applicant</th>
                  <th className="px-3 py-3">Agent</th>
                  <th className="px-3 py-3">Plan</th>
                  <th className="px-3 py-3">Current Status</th>
                  <th className="px-3 py-3">Submitted Date</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e4edf7] text-[#23385e]">
                {data.rows.map((item, index) => (
                  <tr key={item.applicationId}>
                    <td className="px-3 py-3 text-[#617497]">{index + 1}</td>
                    <td className="px-3 py-3">
                      <span className="block font-bold">{item.customer}</span>
                      <span className="block pt-1 text-[#7083a3]">
                        {item.address}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block font-medium">
                        {item.agentId || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block font-medium">{item.plan}</span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="block">{item.date}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        className="min-h-11 rounded-md px-3 text-xs"
                        type="button"
                      >
                        View Application
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-[#e4edf7] lg:hidden">
            {data.rows.map((item) => (
              <article className="p-4" key={item.applicationId}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{item.customer}</h3>
                    <p className="mt-1 text-xs text-[#667a9e]">
                      {item.address} · {item.plan}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-3 text-xs text-[#60749a]">
                  Agent:{" "}
                  <span className="font-medium text-[#25395e]">
                    {item.agentId || "—"}
                  </span>{" "}
                  · {item.date}
                </p>
                <Button className="mt-3 min-h-11 w-full" type="button">
                  View Application
                </Button>
              </article>
            ))}
          </div>
        </DashboardCard>
        <div className="space-y-5">
          <DashboardCard>
            <SectionHeading
              actions={<SelectAffordance label="This Week" />}
              title="My Processing Productivity"
            />
            <div className="px-5 pb-2 sm:px-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold">
                    {data.metrics[0]?.value ?? "0"}
                  </p>
                  <p className="mt-1 text-sm text-[#60749a]">
                    Applications Processed
                  </p>
                </div>
                <p className="text-sm font-bold text-emerald-600">
                  <TrendingUp
                    aria-hidden="true"
                    className="mr-1 inline size-4"
                  />
                  +27%
                </p>
              </div>
            </div>
            {/* Daily productivity time-series requires server-side
                aggregation not yet exposed by the API; kept on illustrative
                fixture data until that endpoint exists. */}
            <div className="h-[220px] px-2">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart
                  data={processorProductivity}
                  margin={{ top: 18, right: 8, left: -22, bottom: 0 }}
                >
                  <CartesianGrid stroke="#e4edf8" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    fontSize={11}
                    stroke="#667a9f"
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    fontSize={11}
                    stroke="#667a9f"
                    tickLine={false}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar
                    dataKey="applications"
                    fill="#45acf0"
                    isAnimationActive={false}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DashboardCard>
          <DashboardCard>
            <SectionHeading title="Quick Stats" />
            <div className="grid grid-cols-2 divide-x divide-y divide-[#e6eef8] border-t border-[#e6eef8]">
              {quickStatMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <div className="p-4" key={metric.label}>
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-lg",
                        metric.tone === "green"
                          ? "bg-emerald-100 text-emerald-600"
                          : metric.tone === "indigo"
                            ? "bg-indigo-100 text-indigo-600"
                            : metric.tone === "amber"
                              ? "bg-amber-100 text-amber-600"
                              : "bg-blue-100 text-blue-600",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <p className="mt-3 text-xl font-bold">{metric.value}</p>
                    <p className="mt-1 text-xs text-[#617497]">
                      {metric.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </DashboardCard>
        </div>
      </div>
    </>
  );
}

export function DashboardPage({ role }: DashboardPageProps) {
  const [searchParams] = useSearchParams();
  const previewState = searchParams.get("state");
  const liveData = useDashboardData(role);
  // A `?state=` query param always wins (manual QA/Playwright preview of the
  // frozen loading/empty/error states); otherwise the state is derived from
  // the live fetch itself.
  const state =
    previewState !== null
      ? resolveDashboardState(previewState)
      : liveData.state;
  const title =
    role === "admin"
      ? "Admin dashboard"
      : role === "agent"
        ? "Agent dashboard"
        : "Processor dashboard";

  return (
    <DashboardShell role={role}>
      {state === "populated" ? (
        role === "admin" ? (
          <AdminDashboard data={liveData} />
        ) : role === "agent" ? (
          <AgentDashboard data={liveData} />
        ) : (
          <ProcessorDashboard data={liveData} />
        )
      ) : (
        <DashboardStateView state={state} title={title} />
      )}
    </DashboardShell>
  );
}
