# Next Task — Phase 03 Authentication and RBAC Plan

Previous phase: **Phase 02 Apps Script and Google Sheets Foundation — Owner Approved (2026-09-14).** Phase 02 is frozen, including its schema/bootstrap, safe-envelope, locking, audit, and esbuild artifact workflow.

Status: **Planned — do not implement until owner authorizes Phase 03.**

## Objective

Plan and then implement secure login, logout, sessions, and server-enforced Admin, Agent, and Processor RBAC. Preserve the Owner Approved Phase 01 dashboards and do not begin application CRUD, uploads, reports, or workflow mutations.

## Recommended authentication architecture

- Use **Google Identity Services (GIS) OpenID Connect** for the initial provider. The backend verifies token signature, issuer, audience, expiry, nonce, and, when chosen, hosted-domain policy. Use the immutable Google `sub` as the provider identity; email is a profile/contact field, never the identity key.
- Do not propose custom passwords for V1. If the owner later approves them, implement only in a suitable server environment using Argon2id password hashes, unique salts, breach/rate-limit controls, reset flow, and no plaintext or reversible password values in Sheets or Script Properties.
- **Owner decision required before implementation:** add a same-origin Vercel BFF/API layer for browser-to-API communication. Apps Script web apps cannot be relied on to set the CORS, `Set-Cookie`, or custom response headers needed for secure cross-origin browser sessions. Direct browser-to-Apps-Script bearer/header authentication is not approved.

## Login, logout, identity, and sessions

1. The frontend loads GIS, obtains a Google ID token, and sends it by HTTPS POST to the same-origin BFF login endpoint with GIS CSRF/nonce validation.
2. The BFF verifies the token against the configured Google web-client audience, then sends a short-lived, signed internal assertion to Apps Script. Apps Script maps `provider_subject` to a `Users` record and is authoritative for `user_id`, `role`, and `account_status` on every API authorization decision.
3. On a valid active user, Apps Script creates a server session. The BFF sets only an opaque, random session token in an `HttpOnly`, `Secure`, `SameSite=Lax`, path-scoped cookie. Never use `localStorage`, URL parameters, or browser-readable persistent tokens.
4. Default recommendation: 30-minute idle expiry and 8-hour absolute expiry; rotate session token on login and privilege/account changes. Logout revokes the server session and clears the cookie. Deactivation revokes all user sessions.
5. Apps Script accepts only BFF-signed, short-lived internal requests and validates their signature, audience, timestamp, nonce/jti, and session hash. It reloads the User record rather than trusting role/account state embedded in a browser or BFF claim.

## Proposed data migration — owner review required

Phase 02 headers are frozen; apply a tested Phase 03 migration rather than silently modifying them.

| Location | Proposed additions | Purpose |
|---|---|---|
| `Users` | `auth_provider`, `provider_subject`, `email_verified_at`, `last_login_at`, `last_logout_at`, `session_version`, `failed_auth_count`, `locked_until` | Federated identity mapping, lifecycle, revocation, and abuse controls. |
| New `Sessions` tab | `session_id`, `session_token_hash`, `user_id`, `issued_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `session_version`, `csrf_secret_hash` | Server-side opaque-session storage; store only token/CSRF hashes. |

No custom-password column is proposed. Configuration secrets—Google client ID/audience, internal signing key, allowed BFF origin, and session settings—belong only in Vercel environment variables or Apps Script Script Properties as appropriate, never in Sheets, browser configuration, or logs.

## RBAC matrix

| Capability | Admin | Agent | Processor |
|---|---:|---:|---:|
| Sign in while account is active | Yes | Yes | Yes |
| View all applications | Yes | No | No |
| Create application | Yes | Yes | No |
| View own applications | Yes | Yes | No |
| View queue/assigned work | Yes | No | Yes |
| Edit customer data | Yes | Before processing only | Limited fields only |
| Assign processor | Yes | No | No |
| Update processing status | Yes | No | Yes |
| Manage users, plans, settings, reports | Yes | No | No |

All authorization occurs in Apps Script against the active User record. Frontend route guards and menus are usability controls only.

## Security controls

- **Inactive accounts:** reject login with a generic safe response, revoke all sessions, deny every authenticated request, and append a security/activity event without sensitive token data.
- **CSRF:** GIS login uses its double-submit/nonce checks. Same-origin cookie-backed mutations use a synchronizer or double-submit CSRF token, verified by the BFF; no unsafe request is authorized from `Origin` alone.
- **Replay:** validate Google token claims and nonce; store/expire login nonces and BFF assertion `jti` values; enforce timestamp windows and single-use handling under `LockService` where Sheets writes occur.
- **Brute force:** rate-limit login and session-validation endpoints at the BFF by a privacy-preserving key; apply exponential delay/temporary lock for repeated failed authentication without disclosing account existence.
- **Session theft:** HTTPS only, `HttpOnly`/`Secure` cookies, token hashing at rest, rotation, idle/absolute expiry, revocation/session-version checks, no token logging, and logout/deactivation invalidation.
- **CORS:** BFF is same-origin with the frontend. It allowlists the production origin only after deployment approval; Apps Script origin checks remain defense in depth, not authentication. No credentialed cross-origin Apps Script fetch is planned.

## API contract and excluded work

Planned BFF-facing endpoints are login, logout, current-session (`me`), and protected API forwarding. Apps Script adds only the corresponding authentication/session verification and authorization primitives. All responses retain the Phase 02 safe JSON envelope; clients branch on `ok`/`error.code`.

Excluded from Phase 03: dashboard redesign, application CRUD/workflow status changes, uploads, Drive access, reporting, production deployment, and custom-password implementation.

## Test and owner-acceptance plan

- Unit-test OIDC claim checks, identity mapping, session hashing/expiry/rotation/revocation, CSRF/nonce/replay controls, inactive accounts, and every RBAC decision.
- Mock BFF, Apps Script Properties/Lock/Sheet adapters, clock, UUID/random-token sources, and audit writes. Test stale/deactivated accounts after login, forged roles, reused assertions, expired sessions, and generic error redaction.
- Integration-test an isolated non-production Google client, Vercel preview/BFF, and Apps Script project: login, refresh within idle window, expiry, logout, deactivation, and all role denial/allow cases.
- Owner acceptance requires review of the BFF addition, Google OAuth configuration, secret-access controls, the exact `Users`/`Sessions` migration, all role behavior, and the existing dashboard regression. No production accounts, Sheet, Web App, or deployment without separate approval.

Approval state: In Progress
