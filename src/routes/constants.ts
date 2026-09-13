import { ROLE_DEFINITIONS, type Role } from "@/types/roles";

export const APP_ROUTES = {
  home: "/",
  admin: ROLE_DEFINITIONS.admin.route,
  agent: ROLE_DEFINITIONS.agent.route,
  processor: ROLE_DEFINITIONS.processor.route,
} as const;

export function routeForRole(role: Role): (typeof APP_ROUTES)[Role] {
  return APP_ROUTES[role];
}
