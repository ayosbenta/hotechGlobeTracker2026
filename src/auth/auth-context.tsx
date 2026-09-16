import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  AuthApiError,
  fetchCurrentSession,
  logout as logoutRequest,
  submitPasswordLogin,
} from "./api-client";
import type { AuthState } from "./types";

interface AuthContextValue {
  readonly state: AuthState;
  /** Re-runs GET /api/auth/me. Used after login and to recover from a stale session. */
  readonly refresh: () => Promise<void>;
  /**
   * Exchanges a username/password for a session via POST /api/auth/login.
   * Rejects with the AuthApiError on failure without changing auth state.
   */
  readonly loginWithPassword: (
    username: string,
    password: string,
  ) => Promise<void>;
  readonly logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function errorFromUnknown(error: unknown): AuthState {
  if (error instanceof AuthApiError)
    return {
      status: "error",
      error: { code: error.code, message: error.message },
    };
  return {
    status: "error",
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  };
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "checking" });

  const refresh = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const result = await fetchCurrentSession();
      setState({
        status: "authenticated",
        user: result.user,
        session: result.session,
      });
    } catch (error) {
      if (
        error instanceof AuthApiError &&
        (error.code === "AUTH_REQUIRED" || error.code === "SESSION_EXPIRED")
      ) {
        setState({ status: "unauthenticated" });
        return;
      }
      setState(errorFromUnknown(error));
    }
  }, []);

  const loginWithPassword = useCallback(
    async (username: string, password: string) => {
      await submitPasswordLogin(username, password);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Logout is safe/idempotent on the server; the browser always treats
      // it as signed out even if the network call itself failed (e.g. the
      // service is unavailable). The failure is intentionally swallowed
      // here rather than rethrown: callers must be able to treat logout as
      // always succeeding locally.
    } finally {
      setState({ status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Runs once on mount only; refresh is stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ state, refresh, loginWithPassword, logout }),
    [state, refresh, loginWithPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
}
