import type { AuthenticatedActor } from "./contracts";

/**
 * Authentication provider selection is deferred. Future routes receive a
 * trusted actor from server-side authentication, never from a client payload.
 */
export interface AuthorizationPolicy {
  may(actor: AuthenticatedActor, action: string, entityType: string): boolean;
}
