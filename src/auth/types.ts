import type { Role } from "@/types/roles";

/** The safe fields the BFF ever returns about the signed-in user. */
export interface AuthUser {
  readonly fullName: string;
  readonly role: Role;
}

export interface AuthSession {
  readonly idleExpiresAt: string;
  readonly absoluteExpiresAt: string;
}

/**
 * Mirrors the BFF's safe error codes (server/auth/http-envelope.ts). The
 * frontend never invents a code of its own; NETWORK_ERROR is the one
 * addition, for a fetch that never reached the server at all.
 */
export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "ACCOUNT_INACTIVE"
  | "ACCOUNT_LOCKED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "REPLAY_OR_CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "AUTH_SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

export interface AuthErrorInfo {
  readonly code: AuthErrorCode;
  readonly message: string;
}

/**
 * Discriminated session state. "checking" is the only state in which a
 * route guard must show a loading view instead of redirecting: it does not
 * yet know whether the visitor is signed in.
 */
export type AuthState =
  | { readonly status: "checking" }
  | { readonly status: "unauthenticated" }
  | {
      readonly status: "authenticated";
      readonly user: AuthUser;
      readonly session: AuthSession;
    }
  | { readonly status: "error"; readonly error: AuthErrorInfo };
