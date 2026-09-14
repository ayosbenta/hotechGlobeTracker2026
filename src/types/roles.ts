export const ROLES = ["admin", "agent", "processor"] as const;

export type Role = (typeof ROLES)[number];

export interface RoleDefinition {
  readonly label: string;
  readonly description: string;
  readonly baseRoute: `/${Role}`;
  readonly dashboardRoute: `/${Role}/dashboard`;
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  admin: {
    label: "Admin",
    description: "Manage the tracker and coordinate the team.",
    baseRoute: "/admin",
    dashboardRoute: "/admin/dashboard",
  },
  agent: {
    label: "Agent",
    description: "Track applications you have submitted.",
    baseRoute: "/agent",
    dashboardRoute: "/agent/dashboard",
  },
  processor: {
    label: "Processor",
    description: "Work assigned applications through each status.",
    baseRoute: "/processor",
    dashboardRoute: "/processor/dashboard",
  },
};
