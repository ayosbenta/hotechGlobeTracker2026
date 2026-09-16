/**
 * Password-authentication policy for the D-049/D-050 migration (batch 2).
 *
 * Apps Script never computes or compares a password hash: `server/auth/
 * password-hash.ts` in the Node BFF owns all crypto, because Apps Script V8 has
 * no Argon2/scrypt primitive (PASSWORD_AUTH_IMPACT_PLAN.md §3). This module owns
 * the policy that surrounds that comparison — identifier normalization,
 * persistent lockout (§8), and the account/role checks that decide whether an
 * already-verified password may become a session.
 *
 * Strictly additive: the Google `login_first_bind` path is untouched and both
 * login paths remain functional side by side until a later batch retires GIS.
 */

/** Consecutive failures that trigger a persistent lockout (§8, "e.g. 5"). */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
/** How long a triggered lockout lasts, in milliseconds. */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** One row of the Credentials tab added by `auth-schema-v2.ts`. */
export interface CredentialRow {
  credentialId: string;
  userId: string;
  loginIdentifierNormalized: string;
  passwordHash: string;
  passwordAlgo: string;
  passwordAlgoParams: string;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  row: number;
}

/**
 * The subset of a Users row this policy needs. `AuthUser` from auth-domain.ts
 * satisfies it structurally, so no import (and no module cycle) is required —
 * the same decoupling `first-bind.ts` uses via `PreprovisionedUser`.
 */
export interface PasswordAuthUser {
  userId: string;
  accountStatus: string;
  role: string;
}

/** Credential-side persistence required by this policy. */
export interface PasswordCredentialStore {
  getCredentialByIdentifier(identifier: string): CredentialRow | null;
  getUserById(userId: string): PasswordAuthUser | null;
  recordFailedAuthAttempt(credentialId: string): void;
  clearFailedAuthAttempts(credentialId: string): void;
  clearLockout(credentialId: string): void;
}

export type PasswordLoginDecision =
  | "allow"
  | "must_change_password"
  | "lock_required"
  | "invalid_identifier"
  | "unknown_identifier"
  | "unknown_user"
  | "account_locked"
  | "account_inactive"
  | "unsupported_role"
  | "password_mismatch";

export interface PasswordLoginOutcome {
  decision: PasswordLoginDecision;
  credential: CredentialRow | null;
  user: PasswordAuthUser | null;
}

/**
 * Normalizes a login identifier for storage and lookup. Accepts an email or a
 * bare username; returns null for anything empty or containing whitespace,
 * which callers must treat as a failed login, never as a wildcard.
 */
export function normalizeLoginIdentifier(identifier: string): string | null {
  const normalized = identifier.trim().toLowerCase();
  if (normalized === "" || /\s/.test(normalized)) return null;
  return normalized;
}

/** True while `lockedUntil` is a valid timestamp still in the future. */
export function isLockedOut(credential: CredentialRow, now: Date): boolean {
  if (credential.lockedUntil === null || credential.lockedUntil === "")
    return false;
  const until = new Date(credential.lockedUntil).getTime();
  if (Number.isNaN(until)) return false;
  return until > now.getTime();
}

/**
 * The timestamp a lockout should run until once the failure threshold is
 * crossed, or null while the account is still below it. Exported so the
 * persistence adapter applies this policy rather than inventing its own.
 */
export function lockoutUntilFor(
  failedLoginCount: number,
  now: Date,
): string | null {
  return failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS
    ? new Date(now.getTime() + LOCKOUT_DURATION_MS).toISOString()
    : null;
}

function outcome(
  decision: PasswordLoginDecision,
  credential: CredentialRow | null = null,
  user: PasswordAuthUser | null = null,
): PasswordLoginOutcome {
  return { decision, credential, user };
}

/**
 * Password-login policy over the Credentials tab.
 *
 * Callers must collapse every non-`allow`/`must_change_password` decision into
 * one generic failure before it reaches a client: the distinctions here exist
 * for audit and lockout bookkeeping, and leaking them would let an attacker
 * enumerate which identifiers exist.
 */
export class PasswordAuthDomain {
  constructor(private readonly store: PasswordCredentialStore) {}

  /**
   * Decides a password login. `passwordVerified` is the BFF's comparison
   * result, trusted here exactly as `email_verified` is trusted on the Google
   * path — the signed internal envelope, not this flag, is what authenticates
   * the caller.
   *
   * Policy only, but it does record failure/success bookkeeping, so the caller
   * must already hold the script lock.
   */
  decidePasswordLogin(input: {
    lockHeld: boolean;
    identifier: string;
    passwordVerified: boolean;
    now: Date;
    isSupportedRole: (role: string) => boolean;
  }): PasswordLoginOutcome {
    if (!input.lockHeld) return outcome("lock_required");

    const identifier = normalizeLoginIdentifier(input.identifier);
    if (identifier === null) return outcome("invalid_identifier");

    const credential = this.store.getCredentialByIdentifier(identifier);
    if (credential === null) return outcome("unknown_identifier");

    // Lockout is checked before the password so a locked account cannot be
    // probed, and so attempts against it do not extend the lockout further.
    if (isLockedOut(credential, input.now))
      return outcome("account_locked", credential);

    if (!input.passwordVerified) {
      this.store.recordFailedAuthAttempt(credential.credentialId);
      return outcome("password_mismatch", credential);
    }

    const user = this.store.getUserById(credential.userId);
    if (user === null) return outcome("unknown_user", credential);
    if (user.accountStatus !== "Active")
      return outcome("account_inactive", credential, user);
    if (!input.isSupportedRole(user.role))
      return outcome("unsupported_role", credential, user);

    // Only a fully successful login clears the counters.
    this.store.clearFailedAuthAttempts(credential.credentialId);
    this.store.clearLockout(credential.credentialId);

    return outcome(
      credential.mustChangePassword ? "must_change_password" : "allow",
      credential,
      user,
    );
  }
}
