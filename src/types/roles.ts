export const ROLES = ["admin", "agent", "processor"] as const;

export type Role = (typeof ROLES)[number];

export interface RoleDefinition {
  readonly label: string;
  readonly description: string;
  readonly route: `/${Role}`;
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  admin: {
    label: "Admin",
    description: "Manage the tracker and coordinate the team.",
    route: "/admin",
  },
  agent: {
    label: "Agent",
    description: "Track applications you have submitted.",
    route: "/agent",
  },
  processor: {
    label: "Processor",
    description: "Work assigned applications through each status.",
    route: "/processor",
  },
};
