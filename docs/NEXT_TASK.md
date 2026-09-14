# Next Task — Phase 03C: Vercel BFF and Frontend Authentication

Previous phase: **Phase 03B Apps Script Auth and Session Domain — Owner Approved and frozen (2026-09-14).**

Status: **Planned only. Do not implement until separately instructed by the owner.**

## Objective

Add a same-origin Vercel BFF and minimal frontend authentication integration. The BFF verifies Google Identity Services ID tokens, generates opaque browser/session material, invokes only approved Phase 03B internal Apps Script operations, and preserves the frozen dashboards.

## Included scope

- Google Identity Services sign-in with a server-issued, short-lived, single-use login nonce bound to each login attempt.
- `POST /api/auth/login`: receive GIS credential and nonce; verify Google ID token server-side using official issuer, JWKS signature, audience/client ID, expiry, nonce, and verified email checks; then call Apps Script `login_first_bind`.
- Node `crypto.randomBytes()` for BFF-created session, CSRF, JTI, login-nonce, and HMAC-signing material, all as unpadded base64url with exact Phase 03B format/length rules.
- Exact BFF-to-Apps-Script canonical assertions: canonical payload JSON/UTF-8 SHA-256 body digest; newline-delimited `v1`, key ID, audience, issued/expires times, JTI, method, path, and digest; HMAC-SHA-256; no trailing newline.
- Environment-variable separation for Google audience/client ID, Apps Script endpoint, internal HMAC key ring/active key ID, and independent token/CSRF/session settings. Support active/retiring/disabled key rotation without browser exposure.
- `GET /api/auth/me`, `GET /api/auth/csrf`, and `POST /api/auth/logout`, all mediated by server-side session validation and safe errors.
- `__Host-` session cookie: `Secure`, `HttpOnly`, `Path=/`, no `Domain`, and `SameSite=Lax`; readable CSRF cookie plus required same-origin CSRF header for unsafe requests.
- Fixed canonical role redirects only: Admin `/admin/dashboard`, Agent `/agent/dashboard`, Processor `/processor/dashboard`. Browser claims never determine role.
- Login/guard/error-state frontend integration while preserving frozen dashboard layout, visual system, menus, and route behavior. Cover inactive, locked, unauthorized, expired-session, and safe generic-error states.
- Vercel serverless rate limiting backed by a durable/shared service or Vercel-supported durable control; never represent process-local memory as durable.
- Appropriate security headers, including GIS-compatible CSP, frame protection, MIME sniffing protection, referrer policy, and HTTPS-only transport behavior.
- Documentation of Apps Script browser/CORS limits: browser code never calls Apps Script directly; CORS is not authentication.

## Security constraints

- Never expose Apps Script HMAC keys, peppers, session tokens, CSRF secrets, Google credentials, assertions, or raw errors to browser code, logs, URLs, or analytics.
- BFF identity and role decisions come only from Phase 03B validation and authoritative Users state, never cookie payloads, routes, or client claims.
- Unsafe requests require matching CSRF cookie/header. Consume the login nonce only after relevant verification succeeds.
- Clear cookies with matching attributes on logout. Revoked, inactive, locked, unauthorized, and expired sessions fail closed.
- No direct browser-to-Apps-Script request and no custom password flow.

## Verification and acceptance

- Unit tests for GIS issuer/JWKS/audience/nonce/time verification, canonical signing vectors, key rotation, cookie flags, CSRF flow, role redirects, safe errors, and rate-limit failures.
- Local mocked tests for GIS/JWKS, Apps Script client, durable rate-limit adapter, and all auth endpoints.
- Isolated preview acceptance with a non-production Google OAuth client, Apps Script/Sheet, endpoint, and independently generated secrets. Never reuse exposed isolated secrets in production.
- Format, lint, typecheck, all tests, Apps Script artifact checks, production build, Playwright frozen-dashboard regressions, credential scan, and `git diff --check`.

## Excluded scope

- Apps Script schema/session-domain changes; application CRUD; uploads/Drive; reports; dashboard redesign; production deployment; push; release; native apps; custom passwords; and Phase 03D enhancements.

## Required owner decisions before implementation

1. Approved Google OAuth web client ID(s), final production domain(s), authorized JavaScript origins, and redirect origins.
2. Approved durable serverless rate-limiting provider/configuration and retention policy.
3. Whether login may use a dedicated route/screen or must be embedded without changing frozen dashboard visuals.
4. Production secret-entry, key rotation, and incident owner/process for Google, BFF HMAC, session/CSRF, and Apps Script properties.
5. Exact UX/copy and escalation behavior for inactive, locked, unauthorized, and expired-session states.

Approval state: **Planned — awaiting owner instruction.**
