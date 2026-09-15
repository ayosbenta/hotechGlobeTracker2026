import { Orbit } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { fetchLoginNonce } from "@/auth/api-client";
import { loadGoogleIdentityServices } from "@/auth/google-identity-services";
import { DashboardCard } from "@/components/dashboard/dashboard-ui";
import { environment } from "@/config/env";
import { safeDestinationForRole } from "@/routes/constants";

type LoginPhase = "loading" | "ready" | "signing-in" | "unavailable";

/**
 * GIS login screen. Never accepts a password, OTP, or any credential typed
 * directly into this app: the only input is the ID token GIS itself returns
 * after the user completes Google sign-in in Google's own UI.
 */
export function LoginPage() {
  const { state, loginWithGoogleCredential } = useAuth();
  const location = useLocation();
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<LoginPhase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Guards against a double-click on the GIS button, or GIS invoking its
  // callback more than once, starting a second concurrent login attempt
  // while one is still in flight.
  const loginInFlightRef = useRef(false);

  useEffect(() => {
    if (state.status !== "unauthenticated") return;
    if (!environment.googleClientId) {
      setPhase("unavailable");
      return;
    }

    let cancelled = false;

    async function setUp() {
      try {
        const [{ nonce }, accountsId] = await Promise.all([
          fetchLoginNonce(),
          loadGoogleIdentityServices(),
        ]);
        if (cancelled) return;

        accountsId.initialize({
          client_id: environment.googleClientId!,
          nonce,
          ux_mode: "popup",
          callback: (response) => {
            if (loginInFlightRef.current) return;
            loginInFlightRef.current = true;
            setPhase("signing-in");
            setErrorMessage(null);
            loginWithGoogleCredential(response.credential)
              .catch(() => {
                if (cancelled) return;
                setPhase("ready");
                setErrorMessage(
                  "Sign-in was not accepted. Please try again, or contact your Admin if this continues.",
                );
              })
              .finally(() => {
                loginInFlightRef.current = false;
              });
          },
        });

        if (buttonContainerRef.current) {
          accountsId.renderButton(buttonContainerRef.current, {
            theme: "outline",
            size: "large",
            width: 280,
            text: "signin_with",
          });
        }
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("unavailable");
      }
    }

    void setUp();
    return () => {
      cancelled = true;
    };
  }, [state.status, loginWithGoogleCredential]);

  if (state.status === "checking") return null;

  if (state.status === "authenticated") {
    const attempted = (location.state as { from?: unknown } | null)?.from;
    const destination = safeDestinationForRole(attempted, state.user.role);
    return <Navigate replace to={destination} />;
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
          Sign in with your Google account to continue.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          {phase === "loading" || phase === "signing-in" ? (
            <p className="text-sm text-[#60749a]" role="status">
              {phase === "signing-in"
                ? "Signing you in…"
                : "Preparing sign-in…"}
            </p>
          ) : phase === "unavailable" ? (
            <p className="text-sm text-rose-600" role="alert">
              Sign-in is temporarily unavailable. Please try again shortly.
            </p>
          ) : null}
          <div
            aria-hidden={phase === "signing-in"}
            className={
              phase === "signing-in"
                ? "pointer-events-none opacity-50"
                : undefined
            }
            ref={buttonContainerRef}
          />
        </div>

        {errorMessage ? (
          <p className="mt-4 text-sm text-rose-600" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {state.status === "error" ? (
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
