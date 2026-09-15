export const ROLE_REDIRECTS: Record<string, string> = {
  Admin: "/admin/dashboard",
  Agent: "/agent/dashboard",
  Processor: "/processor/dashboard",
};

export function roleRedirectFor(role: string | undefined): string | undefined {
  return role ? ROLE_REDIRECTS[role] : undefined;
}
