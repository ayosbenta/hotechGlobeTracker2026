# Phase 03C — Vercel BFF and Frontend Authentication (Canonical Plan)

Status: **Owner Approved architecture (2026-09-15).** This document is the binding authentication
plan for all of Phase 03C. It is split into bounded implementation batches tracked separately in
`NEXT_TASK.md`:

- **Phase 03C1** — Vercel BFF Authentication Backend
- **Phase 03C2** — GIS Login UI and Frontend Authentication Guards
- **Phase 03D** — Isolated Vercel Preview End-to-End Security QA

Previous phase: **Phase 03B Apps Script Auth and Session Domain — Owner Approved and frozen (2026-09-14).**

## Objective

Add a same-origin Vercel BFF and minimal frontend authentication integration. The BFF verifies
Google Identity Services (GIS) ID tokens, generates opaque browser/session material, invokes only
approved frozen Phase 03B internal Apps Script operations, and preserves the frozen dashboards.

## Architecture and trust boundaries

- Request path is Browser → same-origin Vercel BFF → Apps Script → Google Sheets.
- Browser code never calls Apps Script directly. Apps Script CORS is not an authentication boundary.
- Apps Script remains authoritative for user, role, account, first binding, session, and CSRF
  validation. Browser claims, cookie payloads, routes, and client-provided roles never determine
  authorization.
- Google Sign-In only: no custom passwords, public signup, or arbitrary return URLs.

## Required dependencies

- `google-auth-library` for Google ID-token verification, including Google key retrieval/caching.
  Do not manually implement Google JWKS verification.
- `@upstash/redis` for durable login-nonce transactions.
- `@upstash/ratelimit` for shared serverless rate limiting.
- Node built-in `crypto` for `randomBytes`, SHA-256, and HMAC.
- Existing project validation utilities when sufficient; do not add a second schema-validation
  library unnecessarily.

## Login transaction and GIS flow

### `POST /api/auth/nonce`

- Request is empty; accept no identity, role, email, or redirect input.
- Generate a 32-random-byte login transaction token and a 32-random-byte Google OIDC nonce.
- Store only a hash-derived Redis key and nonce hash for five minutes, using Redis `SET` with `NX`
  and expiry.
- Set `__Host-hotech_login`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=300`, no `Domain`.
- Return only `{ ok: true, requestId, data: { nonce, expiresAt } }`.
- The browser supplies returned `nonce` to GIS. The raw transaction token is never browser-readable.

### `POST /api/auth/login`

- Request body is only `{ credential: string }`; read `__Host-hotech_login`.
- Retrieve the matching nonce transaction without consuming it first.
- Verify the GIS ID token with `google-auth-library` and exact configured audience. Explicitly
  verify issuer, signature, audience, expiry, nonce claim against stored nonce hash, non-empty
  `sub`, normalized email, and `email_verified=true`.
- After credential and nonce verification, atomically consume the transaction using Redis
  compare-and-delete/Lua semantics. Reuse and concurrent attempts fail safely.
- Send a signed `login_first_bind` request to Apps Script. Clear `__Host-hotech_login` on success
  and terminal failure.

### Google account and first-bind policy

- No hosted-domain restriction in V1.
- Permit verified `@gmail.com` identities and verified Google Workspace identities with `hd` present.
- Deny third-party-domain Google Accounts where Google is not currently authoritative for the
  mailbox unless separately owner-approved.
- Apps Script permits first binding only for exactly one active pre-provisioned Users match. The
  immutable Google `sub` becomes authoritative after binding.

## Session and CSRF

- Session cookie: `__Host-hotech_session`, opaque 32-random-byte unpadded-base64url token,
  `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`; `Max-Age` must not exceed remaining
  eight-hour absolute session lifetime.
- CSRF cookie: `__Host-hotech_csrf`, opaque 32-random-byte unpadded-base64url token, `Secure`,
  `SameSite=Strict`, `Path=/`, no `Domain`, not `HttpOnly`; `Max-Age` is bounded by current session
  lifetime.
- CSRF header is `X-CSRF-Token`.
- `GET /api/auth/csrf` requires a valid session, requests `issue_csrf` from Apps Script, sets a
  replacement CSRF cookie, returns the same value in `data.csrfToken`, and uses
  `Cache-Control: no-store`.
- `POST /api/auth/logout` requires session plus matching CSRF cookie and `X-CSRF-Token`; forward the
  token to Apps Script for authoritative hash validation. Clear session, CSRF, and login cookies
  with matching attributes. Logout is safe and idempotent.
- All future `POST`/`PUT`/`PATCH`/`DELETE` BFF routes use this CSRF flow.
- Phase 03 session limits remain 30-minute idle, 8-hour absolute, and 5-minute touch; Apps Script
  stores only secret hashes.

## BFF route contracts

All auth responses use `Cache-Control: no-store`. Safe failures are:

```json
{
  "ok": false,
  "requestId": "...",
  "error": { "code": "...", "message": "..." }
}
```

Never return provider subject, email, internal IDs, Sheet IDs, session IDs, token hashes, Apps
Script payloads, or configuration.

| Route                   | Request                                       | Success data                                                                              |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/auth/nonce`  | empty                                         | `{ nonce, expiresAt }`                                                                    |
| `POST /api/auth/login`  | `{ credential }`                              | `{ user: { fullName, role }, redirectTo }`                                                |
| `GET /api/auth/me`      | session cookie                                | `{ user: { fullName, role }, session: { idleExpiresAt, absoluteExpiresAt }, redirectTo }` |
| `GET /api/auth/csrf`    | valid session                                 | `{ csrfToken }`                                                                           |
| `POST /api/auth/logout` | valid session and matching CSRF cookie/header | `{ loggedOut: true }`                                                                     |

Every success envelope is `{ ok: true, requestId, data }`.

## Statuses, redirects, and account behavior

- Browser-facing status mapping: `400 VALIDATION_ERROR`; `401 AUTH_REQUIRED` or `SESSION_EXPIRED`;
  `403 ACCOUNT_INACTIVE`, `ACCOUNT_LOCKED`, or `FORBIDDEN`; `404 NOT_FOUND`; `409 REPLAY_OR_CONFLICT`;
  `429 RATE_LIMITED`; `502 UPSTREAM_UNAVAILABLE`; `503 AUTH_SERVICE_UNAVAILABLE`; `500 INTERNAL_ERROR`.
- User-facing copy is generic and must not disclose whether an email or user row exists. Locked or
  inactive users may be told to contact the Admin.
- Canonical role redirects only: Admin → `/admin/dashboard`; Agent → `/agent/dashboard`;
  Processor → `/processor/dashboard`.
- Revoked, inactive, locked, unknown, expired, unauthorized, and wrong-role sessions fail closed. No
  arbitrary redirect target exists.

## Durable rate limiting

- Use Upstash Redis/shared serverless rate limiting; never process-local memory.
- Derive all privacy keys using HMAC-SHA-256 and `RATE_LIMIT_KEY_SECRET`; never use raw IP, email,
  `sub`, or session token as a Redis key.
- Limits: nonce: 10/minute and 50/hour per privacy-hashed IP; login: 5/10 minutes per
  privacy-hashed IP and, after verified token, 10/hour per privacy-hashed Google `sub`; me:
  60/minute per session-derived privacy key; csrf: 20/minute per session-derived privacy key;
  logout: 10/minute per session-derived privacy key.
- If Upstash is unavailable: nonce, login, and csrf fail closed with `503`; me may continue with
  authoritative Apps Script validation; logout still attempts authoritative logout and cookie
  clearing. Never silently substitute process-local limiting.
- Disable Upstash analytics for auth identifiers unless separately owner-approved.

## Google verification and key caching

- Delegate Google key retrieval and cache behavior to `google-auth-library`.
- Fail closed when an ID token cannot be securely verified. Do not use a production tokeninfo
  endpoint or implement an independent stale-key acceptance window.
- An unknown `kid` may use the library's normal refresh behavior; failed verification remains denial.

## Internal Apps Script signing

Reuse frozen Phase 03B exactly:

- Body bytes are canonical UTF-8 JSON; the body digest is SHA-256 encoded as unpadded base64url.
- Canonical newline-delimited fields, with no final newline: `v1`, `key_id`, `audience`,
  `issued_at`, `expires_at`, `jti`, `method`, `path`, `body_digest`.
- HMAC-SHA-256 is unpadded base64url; assertion lifetime is at most 60 seconds; allowed clock skew
  is 30 seconds; JTI has at least 16 random bytes.
- Add cross-runtime golden vectors proving Node BFF output verifies in frozen Apps Script.
- Support active, retiring, and disabled internal HMAC keys without browser exposure.

## Environment variables

Public:

- `VITE_GOOGLE_CLIENT_ID`

Server-only:

- `GOOGLE_CLIENT_ID`
- `APPS_SCRIPT_INTERNAL_URL`
- `INTERNAL_AUDIENCE`
- `INTERNAL_HMAC_KEYS_JSON`
- `INTERNAL_HMAC_ACTIVE_KEY_ID`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RATE_LIMIT_KEY_SECRET`
- `APP_ORIGIN`

The public and server Google client IDs must match for this single-web-client V1. Never expose
server-only variables through `VITE_` prefixes or browser bundles.

## Security headers and exposure rules

- Set a Content-Security-Policy with `self` by default and only required Google GIS
  script/frame/connect/style origins; test it against real GIS login in preview and do not broadly
  weaken it for a missing origin.
- Set `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`,
  `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
- Set a Permissions-Policy disabling unused camera, microphone, geolocation, payment, and USB
  capabilities.
- Set Strict-Transport-Security only on HTTPS deployments.
- Never expose Apps Script HMAC keys, peppers, session tokens, CSRF secrets, Google credentials,
  assertions, raw errors, or internal data in browser code, logs, URLs, or analytics.

## Development, preview, and acceptance

- Automated local authentication tests use injected mocked Google, Redis, Apps Script, clock, and
  crypto adapters.
- No production-security flag may disable cookie, nonce, token, signature, CSRF, or rate-limit
  validation. Secure `__Host-` cookies therefore require HTTPS even for manual local testing.
- Manual real Google login is performed only on a Vercel Preview HTTPS URL.
- Create a distinct non-production Google OAuth Web Client and add the exact Preview HTTPS origin
  to Authorized JavaScript origins.
- Use an isolated Sheet and Apps Script deployment with independently generated secrets. Never use
  production IDs, users, secrets, or resources; never reuse exposed non-production secrets in
  production.

## Full Phase 03C included scope

- Vercel BFF authentication routes and GIS login screen.
- Login nonce transaction, Google verification, and frozen Phase 03B internal signing.
- Session/CSRF cookies and minimal authentication guard, redirect, and error integration.
- Upstash durable rate limiting, security headers, mocked/local tests, and a preview-ready
  acceptance runbook.

## Full Phase 03C excluded scope

- Production deployment; Phase 03B domain/schema changes; application CRUD; uploads/Drive; reports;
  dashboard redesign; public signup/passwords; GitHub push/release.
- Preserve frozen dashboards with no material changes to layout, visual system, menus, or canonical
  route behavior.

## Verification and acceptance

- Unit and endpoint tests for GIS issuer/signature/audience/expiry/nonce/time verification,
  canonical signing vectors, key rotation, cookies, CSRF, redirects, safe errors, and rate-limit
  failures/outages.
- Mocked local tests for Google, Redis, Apps Script, clock, crypto, and all authentication endpoints.
- Isolated Vercel Preview acceptance using only non-production Google, Apps Script/Sheet, users,
  endpoint, and independent secrets.
- Run formatting, lint, typecheck, all tests, Apps Script artifact checks, production build,
  frozen-dashboard Playwright regressions, credential scan, and `git diff --check`.

## Batch split

### Phase 03C1 — Vercel BFF Authentication Backend

Backend-only: typed envelopes, env validation, Google verifier adapter, Upstash nonce store and
rate limiting, Node crypto token/JTI/HMAC implementation, frozen Phase 03B-compatible signing with
cross-runtime golden vectors, cookie utilities, CSRF validation, Apps Script internal client, all
five BFF routes, safe error/status mapping, security headers, mocked tests, and preview acceptance
runbook preparation. No frontend UI or browser-facing auth state. See `NEXT_TASK.md` for the bounded
task definition.

### Phase 03C2 — GIS Login UI and Frontend Authentication Guards

GIS login screen, browser auth provider/state, dashboard route guards, canonical role redirects,
and frozen-dashboard-preserving error/loading states. Depends on Phase 03C1 routes existing and
tested. Not yet started; will get its own bounded `NEXT_TASK.md` entry when Phase 03C1 is complete
and owner-approved.

### Phase 03D — Isolated Vercel Preview End-to-End Security QA

Real GIS login against a non-production Google OAuth Web Client, isolated Sheet/Apps Script
deployment, and independent secrets on a Vercel Preview HTTPS URL. Validates the full Phase 03C1 +
03C2 flow end-to-end before any production consideration. Not yet started.
