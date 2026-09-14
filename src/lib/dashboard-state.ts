import { DASHBOARD_STATES, type DashboardState } from "@/types/dashboard";

export function resolveDashboardState(value: string | null): DashboardState {
  return DASHBOARD_STATES.includes(value as DashboardState)
    ? (value as DashboardState)
    : "populated";
}
