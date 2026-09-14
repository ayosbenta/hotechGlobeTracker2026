import {
  AlertCircle,
  ChevronDown,
  Ellipsis,
  Search,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DashboardState,
  Metric,
  StatusBreakdown,
  StatusTone,
} from "@/types/dashboard";

const toneClasses: Record<
  StatusTone,
  {
    readonly icon: string;
    readonly surface: string;
    readonly badge: string;
    readonly dot: string;
  }
> = {
  amber: {
    icon: "bg-amber-100 text-amber-600",
    surface: "from-amber-50 to-[#fffbf3]",
    badge: "bg-amber-100 text-amber-700",
    dot: "#f7b940",
  },
  blue: {
    icon: "bg-blue-100 text-[#0879ee]",
    surface: "from-blue-50 to-[#f5fbff]",
    badge: "bg-blue-100 text-blue-700",
    dot: "#3489ee",
  },
  green: {
    icon: "bg-emerald-100 text-emerald-600",
    surface: "from-emerald-50 to-[#f4fcf8]",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "#42bd7b",
  },
  indigo: {
    icon: "bg-indigo-100 text-indigo-600",
    surface: "from-indigo-50 to-[#f6f5ff]",
    badge: "bg-indigo-100 text-indigo-700",
    dot: "#7656dd",
  },
  red: {
    icon: "bg-rose-100 text-rose-600",
    surface: "from-rose-50 to-[#fff7f8]",
    badge: "bg-rose-100 text-rose-700",
    dot: "#ef4d5d",
  },
};

function toneForStatus(status: string): StatusTone {
  if (status === "Pending") return "amber";
  if (status === "Installed") return "green";
  if (status === "Ongoing") return "indigo";
  if (status === "Cancelled" || status === "For Processing")
    return status === "Cancelled" ? "red" : "amber";
  return "blue";
}

export function DashboardCard({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[#dce8f6] bg-white shadow-[0_10px_28px_rgba(10,66,142,0.045)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  actions,
  eyebrow,
  title,
}: {
  readonly title: string;
  readonly eyebrow?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-[#081947]">
          {title}
        </h2>
        {eyebrow ? (
          <p className="mt-1 text-sm text-[#60749b]">{eyebrow}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function SelectAffordance({ label }: { readonly label: string }) {
  return (
    <button
      className="flex min-h-11 items-center gap-5 rounded-lg border border-[#d2dfef] bg-white px-3 text-xs font-medium text-[#32496f] hover:bg-blue-50"
      type="button"
    >
      {label}
      <ChevronDown aria-hidden="true" className="size-4" />
    </button>
  );
}

export function MetricCard({
  metric,
  compact = false,
}: {
  readonly metric: Metric;
  readonly compact?: boolean;
}) {
  const Icon = metric.icon;
  const tone = toneClasses[metric.tone];

  return (
    <article
      className={cn(
        "min-w-0 rounded-xl border border-[#dce8f6] bg-gradient-to-br p-4 shadow-[0_8px_20px_rgba(10,66,142,0.035)]",
        tone.surface,
        compact ? "sm:p-4" : "sm:p-5",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-2xl",
            tone.icon,
            compact ? "size-11" : "size-12",
          )}
        >
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-5 text-[#53698e] sm:text-sm">
            {metric.label}
          </p>
          <p
            className={cn(
              "font-bold tracking-tight text-[#07183f]",
              compact ? "mt-1 text-2xl" : "mt-1 text-3xl",
            )}
          >
            {metric.value}
          </p>
          <p className="mt-1 text-xs text-[#63779c]">{metric.detail}</p>
          {metric.trend ? (
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <TrendingUp aria-hidden="true" className="size-3.5" />{" "}
              {metric.trend}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function StatusBadge({ status }: { readonly status: string }) {
  const tone = toneClasses[toneForStatus(status)];

  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
        tone.badge,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function StatusDonut({
  data,
}: {
  readonly data: readonly StatusBreakdown[];
}) {
  const chartData = data.map((entry) => ({
    ...entry,
    color: toneClasses[entry.tone].dot,
  }));
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="grid items-center gap-3 p-5 pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.8fr)] sm:px-6">
      <div className="h-[230px] min-w-0">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              cx="50%"
              cy="50%"
              data={chartData}
              dataKey="value"
              innerRadius="58%"
              isAnimationActive={false}
              outerRadius="82%"
              paddingAngle={1}
              stroke="none"
            >
              {chartData.map((entry) => (
                <Cell fill={entry.color} key={entry.label} />
              ))}
            </Pie>
            <text
              fill="#091b48"
              textAnchor="middle"
              x="50%"
              y="47%"
              className="fill-current text-2xl font-bold"
            >
              {total.toLocaleString()}
            </text>
            <text
              fill="#63779c"
              textAnchor="middle"
              x="50%"
              y="59%"
              className="fill-current text-xs"
            >
              Total
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-3">
        {chartData.map((entry) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm"
            key={entry.label}
          >
            <span className="flex min-w-0 items-center gap-2 text-[#253a62]">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
            </span>
            <span className="font-bold text-[#101e44]">
              {entry.value}
              <span className="ml-1 text-xs font-normal text-[#7182a1]">
                ({Math.round((entry.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartLegend({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly color: string }[];
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 px-5 pb-5 text-xs text-[#344b72]">
      {items.map((item) => (
        <span className="flex items-center gap-1.5" key={item.label}>
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function FilterBar({
  includeDate = false,
}: {
  readonly includeDate?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
      <label className="relative min-w-[180px] flex-1 sm:max-w-[240px]">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6680a5]"
        />
        <input
          aria-label="Filter applications"
          className="h-11 w-full rounded-lg border border-[#d2dfef] bg-white pl-9 pr-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="Search applications..."
          type="search"
        />
      </label>
      <SelectAffordance label="All Status" />
      {includeDate ? <SelectAffordance label="Last 30 Days" /> : null}
    </div>
  );
}

export function TableAction() {
  return (
    <button
      aria-label="More application actions"
      className="grid min-h-11 min-w-11 place-items-center rounded-lg text-[#567099] hover:bg-blue-50"
      type="button"
    >
      <Ellipsis aria-hidden="true" className="size-5" />
    </button>
  );
}

export function DashboardStateView({
  state,
  title,
}: {
  readonly state: Exclude<DashboardState, "populated">;
  readonly title: string;
}) {
  if (state === "loading") {
    return (
      <div aria-busy="true" className="space-y-5">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-blue-100" />
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              className="h-32 animate-pulse rounded-xl bg-white"
              key={index}
            />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  const isError = state === "error";
  return (
    <DashboardCard className="mx-auto mt-10 max-w-xl p-8 text-center">
      <span
        className={cn(
          "mx-auto grid size-12 place-items-center rounded-full",
          isError ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600",
        )}
      >
        <AlertCircle aria-hidden="true" className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-bold text-[#081947]">
        {isError ? `Unable to load ${title}` : `No ${title.toLowerCase()} yet`}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#62769a]">
        {isError
          ? "Please try again. No application data was changed."
          : "New dashboard activity will appear here when it is available."}
      </p>
      <Button
        className="mt-5 min-h-11"
        onClick={() => window.location.assign(window.location.pathname)}
      >
        {isError ? "Try again" : "Return to dashboard"}
      </Button>
    </DashboardCard>
  );
}
