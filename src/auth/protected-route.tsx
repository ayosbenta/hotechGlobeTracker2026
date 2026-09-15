import { Navigate, useLocation } from "react-router-dom";

import { routeForRole, safeDestinationForRole } from "@/routes/constants";
import type { Role } from "@/types/roles";

import { useAuth } from "./auth-context";
import { AuthStateView } from "./auth-state-view";

interface ProtectedRouteProps {
  readonly role: Role;
  readonly children: React.ReactNode;
}

/**
 * Guards a single role's routes. Authorization is never decided from a
 * client-side claim: the only source of truth is the AuthProvider's state,
 * which itself comes only from GET /api/auth/me (Apps Script authoritative).
 * A signed-in user visiting the wrong role's route is redirected to their
 * own canonical dashboard, never granted access.
 */
export function ProtectedRoute({ role, children }: ProtectedRouteProps) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "checking") {
    return <AuthStateView state={state} />;
  }

  if (state.status === "unauthenticated") {
    // Only this route's own canonical dashboard path is ever stored as an
    // attempted destination — never the raw location.pathname, which could
    // be any string the router matched. safeDestinationForRole() on the
    // login page re-validates this against the authoritative role anyway,
    // but this route never even offers it a value outside the allowlist.
    return (
      <Navigate
        replace
        state={{ from: safeDestinationForRole(location.pathname, role) }}
        to="/login"
      />
    );
  }

  if (state.status === "error") {
    return <AuthStateView state={state} />;
  }

  if (state.user.role !== role) {
    return <Navigate replace to={routeForRole(state.user.role)} />;
  }

  return <>{children}</>;
}
