import { Orbit } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { AuthApiError } from "@/auth/api-client";
import { useAuth } from "@/auth/auth-context";
import { DashboardCard } from "@/components/dashboard/dashboard-ui";
import { Button } from "@/components/ui/button";
import { environment } from "@/config/env";
import { safeDestinationForRole } from "@/routes/constants";

function loginErrorMessage(error: unknown): string {
  const code = error instanceof AuthApiError ? error.code : null;
  switch (code) {
    case "AUTH_REQUIRED":
    case "VALIDATION_ERROR":
      return "Incorrect username or password.";
    case "RATE_LIMITED":
      return "Too many sign-in attempts. Please wait and try again.";
    case "ACCOUNT_INACTIVE":
    case "ACCOUNT_LOCKED":
      return "This account is not active. Please contact your Admin.";
    case "AUTH_SERVICE_UNAVAILABLE":
    case "UPSTREAM_UNAVAILABLE":
      return "Sign-in is temporarily unavailable. Please try again shortly.";
    default:
      return "Sign-in was not accepted. Please try again, or contact your Admin if this continues.";
  }
}

const inputClassName =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-[#07183f] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:opacity-60";

/**
 * Password login screen. Credentials are held only in component state for
 * the duration of the request and are never written to browser storage.
 */
export function LoginPage() {
  const { state, loginWithPassword } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Guards against a double submit starting a second concurrent login
  // attempt while one is still in flight.
  const loginInFlightRef = useRef(false);

  if (state.status === "checking") return null;

  if (state.status === "authenticated") {
    const attempted = (location.state as { from?: unknown } | null)?.from;
    const destination = safeDestinationForRole(attempted, state.user.role);
    return <Navigate replace to={destination} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginInFlightRef.current) return;
    if (!username.trim() || !password) {
      setErrorMessage("Enter your username and password.");
      return;
    }
    loginInFlightRef.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await loginWithPassword(username.trim(), password);
    } catch (error) {
      setPassword("");
      setErrorMessage(loginErrorMessage(error));
    } finally {
      loginInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(155deg,#06357f_0%,#0867cc_55%,#20b9ee_100%)] px-4">
      <DashboardCard className="w-full max-w-sm p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-100 text-blue-700">
          <Orbit aria-hidden="true" className="size-8" />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-[#07183f]">
          {environment.appName}
        </h1>
        <p className="mt-2 text-sm text-[#60749a]">
          Sign in with your username and password to continue.
        </p>

        <form
          className="mt-8 flex flex-col gap-4 text-left"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="text-sm font-medium text-[#07183f]">
            Username
            <input
              autoComplete="username"
              className={inputClassName}
              disabled={submitting}
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              type="text"
              value={username}
            />
          </label>
          <label className="text-sm font-medium text-[#07183f]">
            Password
            <input
              autoComplete="current-password"
              className={inputClassName}
              disabled={submitting}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          <Button className="mt-2 w-full" disabled={submitting} type="submit">
            {submitting ? "Signing you in…" : "Sign in"}
          </Button>
        </form>

        {errorMessage ? (
          <p className="mt-4 text-sm text-rose-600" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {state.status === "error" && !errorMessage ? (
          <p className="mt-4 text-sm text-rose-600" role="alert">
            {state.error.code === "ACCOUNT_INACTIVE" ||
            state.error.code === "ACCOUNT_LOCKED"
              ? "This account is not active. Please contact your Admin."
              : "Something went wrong. Please try again."}
          </p>
        ) : null}
      </DashboardCard>
    </div>
  );
}
