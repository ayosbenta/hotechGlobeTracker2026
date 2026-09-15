import type { Role } from "@/types/roles";

/**
 * The BFF returns the capitalized role strings Apps Script stores
 * ("Admin" | "Agent" | "Processor" — see apps-script/core/auth-domain.ts
 * supportedRole()). This is the single place that maps that server value to
 * the frontend's lowercase Role type. An unrecognized value is never
 * coerced to a guess; the caller must treat it as authentication failure.
 */
const SERVER_ROLE_TO_ROLE: Record<string, Role> = {
  Admin: "admin",
  Agent: "agent",
  Processor: "processor",
};

export function roleFromServerValue(value: string): Role | undefined {
  return Object.hasOwn(SERVER_ROLE_TO_ROLE, value)
    ? SERVER_ROLE_TO_ROLE[value]
    : undefined;
}
