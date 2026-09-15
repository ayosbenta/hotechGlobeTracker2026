import { OAuth2Client } from "google-auth-library";

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  emailVerified: true;
  hostedDomain: string | null;
  nonce: string;
}

export class GoogleVerificationError extends Error {
  constructor() {
    super("Google ID token could not be verified.");
    this.name = "GoogleVerificationError";
  }
}

export interface GoogleIdTokenVerifier {
  /** Verifies issuer/signature/audience/expiry and returns claims, including the raw nonce claim, unconsumed. */
  verify(credential: string): Promise<VerifiedGoogleIdentity>;
}

/**
 * Wraps google-auth-library so key retrieval, caching, issuer, audience,
 * signature, and expiry checks are delegated to the library and fail closed.
 */
export function createGoogleIdTokenVerifier(
  clientId: string,
): GoogleIdTokenVerifier {
  const client = new OAuth2Client(clientId);
  return {
    async verify(credential) {
      let ticket;
      try {
        ticket = await client.verifyIdToken({
          idToken: credential,
          audience: clientId,
        });
      } catch {
        throw new GoogleVerificationError();
      }
      const payload = ticket.getPayload();
      if (!payload) throw new GoogleVerificationError();
      if (payload.aud !== clientId) throw new GoogleVerificationError();
      if (
        payload.iss !== "accounts.google.com" &&
        payload.iss !== "https://accounts.google.com"
      )
        throw new GoogleVerificationError();
      if (typeof payload.nonce !== "string" || payload.nonce === "")
        throw new GoogleVerificationError();
      if (typeof payload.sub !== "string" || payload.sub === "")
        throw new GoogleVerificationError();
      if (typeof payload.email !== "string" || payload.email === "")
        throw new GoogleVerificationError();
      if (payload.email_verified !== true) throw new GoogleVerificationError();
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp !== "number" || payload.exp <= now)
        throw new GoogleVerificationError();
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: true,
        hostedDomain: typeof payload.hd === "string" ? payload.hd : null,
        nonce: payload.nonce,
      };
    },
  };
}

/**
 * Deny verified Google Accounts on third-party domains where Google is not
 * authoritative for the mailbox, per the Phase 03C first-bind policy.
 * Verified @gmail.com and any Workspace identity with `hd` present are
 * permitted; anything else is denied unless separately owner-approved.
 */
export function isPermittedGoogleAccountDomain(
  identity: VerifiedGoogleIdentity,
): boolean {
  const email = identity.email.trim().toLowerCase();
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0) return false;
  const domain = email.slice(atIndex + 1);
  if (domain === "gmail.com") return true;
  return identity.hostedDomain !== null && identity.hostedDomain !== "";
}
