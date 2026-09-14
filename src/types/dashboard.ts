import type { LucideIcon } from "lucide-react";

export const DASHBOARD_STATES = [
  "populated",
  "loading",
  "empty",
  "error",
] as const;

export type DashboardState = (typeof DASHBOARD_STATES)[number];

export type StatusTone = "amber" | "blue" | "green" | "indigo" | "red";

export interface Metric {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly trend?: string;
  readonly tone: StatusTone;
  readonly icon: LucideIcon;
}

export interface TrendPoint {
  readonly label: string;
  readonly applications: number;
  readonly pending?: number;
  readonly ongoing?: number;
  readonly installed?: number;
  readonly cancelled?: number;
}

export interface StatusBreakdown {
  readonly label: string;
  readonly value: number;
  readonly tone: StatusTone;
}
