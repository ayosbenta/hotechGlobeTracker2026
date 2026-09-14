import { ROLE_DEFINITIONS, type Role } from "@/types/roles";

export const APP_ROUTES = {
  home: "/",
  admin: ROLE_DEFINITIONS.admin.baseRoute,
  agent: ROLE_DEFINITIONS.agent.baseRoute,
  processor: ROLE_DEFINITIONS.processor.baseRoute,
  adminDashboard: ROLE_DEFINITIONS.admin.dashboardRoute,
  agentDashboard: ROLE_DEFINITIONS.agent.dashboardRoute,
  processorDashboard: ROLE_DEFINITIONS.processor.dashboardRoute,
} as const;

const DASHBOARD_ROUTES: Record<Role, `/${Role}/dashboard`> = {
  admin: APP_ROUTES.adminDashboard,
  agent: APP_ROUTES.agentDashboard,
  processor: APP_ROUTES.processorDashboard,
};

export function routeForRole(role: Role): `/${Role}/dashboard` {
  return DASHBOARD_ROUTES[role];
}
