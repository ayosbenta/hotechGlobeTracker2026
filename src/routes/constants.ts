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

const CANONICAL_DASHBOARD_ROUTES: readonly string[] = [
  APP_ROUTES.adminDashboard,
  APP_ROUTES.agentDashboard,
  APP_ROUTES.processorDashboard,
];

/**
 * The only "attempted destination" a redirect back from /login may ever
 * honor. Rejects everything else — no arbitrary return URL, no
 * query-controlled redirect, no external URL — and additionally requires
 * the destination to belong to the caller's own authoritative role, so a
 * visitor who first tried another role's dashboard is never sent there
 * after signing in as someone else.
 */
export function safeDestinationForRole(
  attempted: unknown,
  role: Role,
): `/${Role}/dashboard` {
  if (
    typeof attempted === "string" &&
    CANONICAL_DASHBOARD_ROUTES.includes(attempted) &&
    attempted === routeForRole(role)
  ) {
    return attempted as `/${Role}/dashboard`;
  }
  return routeForRole(role);
}
