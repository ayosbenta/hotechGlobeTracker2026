import { AlertCircle, Loader2, Lock, ShieldAlert } from "lucide-react";

import { DashboardCard } from "@/components/dashboard/dashboard-ui";
import { Button } from "@/components/ui/button";

import type { AuthState } from "./types";

/**
 * Renders the safe, generic-copy states for "checking" and "error" auth
 * states, reusing the frozen dashboard card styling so a mid-navigation
 * auth check never looks visually foreign. Never discloses whether an
 * email or user row exists, and never echoes a raw server error message
 * for ACCOUNT_INACTIVE/ACCOUNT_LOCKED — only the fixed generic copy below.
 */
export function AuthStateView({
  state,
}: {
  readonly state: Extract<AuthState, { status: "checking" | "error" }>;
}) {
  if (state.status === "checking") {
    return (
      <div
        aria-busy="true"
        className="flex min-h-screen items-center justify-center bg-[#f4f9ff]"
      >
        <div className="flex flex-col items-center gap-3 text-[#3a5480]">
          <Loader2 aria-hidden="true" className="size-8 animate-spin" />
          <p className="text-sm font-medium">Checking your session…</p>
        </div>
      </div>
    );
  }

  const { code } = state.error;
  const isAccountIssue =
    code === "ACCOUNT_INACTIVE" || code === "ACCOUNT_LOCKED";
  const Icon = isAccountIssue
    ? Lock
    : code === "FORBIDDEN"
      ? ShieldAlert
      : AlertCircle;
  const heading = isAccountIssue
    ? "Your account needs attention"
    : code === "FORBIDDEN"
      ? "Access denied"
      : "Something went wrong";
  const body = isAccountIssue
    ? "Please contact your Admin to restore access to this account."
    : code === "RATE_LIMITED"
      ? "Too many attempts. Please wait a moment and try again."
      : code === "UPSTREAM_UNAVAILABLE" || code === "AUTH_SERVICE_UNAVAILABLE"
        ? "The service is temporarily unavailable. Please try again shortly."
        : "Please try again. No changes were made.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f9ff] px-4">
      <DashboardCard className="w-full max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-rose-100 text-rose-600">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-[#081947]">{heading}</h1>
        <p className="mt-2 text-sm leading-6 text-[#62769a]">{body}</p>
        <Button
          className="mt-6 min-h-11 w-full"
          onClick={() => window.location.assign("/login")}
          type="button"
        >
          Back to sign in
        </Button>
      </DashboardCard>
    </div>
  );
}
