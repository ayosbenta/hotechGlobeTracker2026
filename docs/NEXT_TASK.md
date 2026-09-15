# Next Task — Phase 03C1: Vercel BFF Authentication Backend

Previous phase: **Phase 03B Apps Script Auth and Session Domain — Owner Approved and frozen (2026-09-14).**
Architecture reference: **`docs/PHASE_03C_AUTH_PLAN.md` — Owner Approved (2026-09-15), binding for all of Phase 03C.**

Status: **Planned only. Do not implement until separately instructed by the owner.**

## Objective

Implement the Vercel BFF authentication backend only: typed request/response handling, Google ID
token verification, durable nonce/rate-limit storage, frozen Phase 03B-compatible internal signing,
session/CSRF cookie mechanics, and the five auth routes. No frontend UI or browser auth state.

Full route contracts, cookie attributes, Redis flow, rate limits, Google verification rules,
signing rules, environment variables, security headers, and preview isolation rules are defined in
`docs/PHASE_03C_AUTH_PLAN.md` and are binding for this batch.

## Included scope

- Typed BFF request/response envelopes
- Environment validation
- `google-auth-library` verifier adapter
- Upstash Redis login-nonce transaction store
- Durable Upstash rate-limit adapter
- Node `crypto` token/JTI/HMAC implementation
- Frozen Phase 03B-compatible canonical signing
- Cross-runtime golden signing vectors
- Cookie creation and clearing utilities
- CSRF cookie/header validation
- Apps Script internal client
- BFF routes: `POST /api/auth/nonce`, `POST /api/auth/login`, `GET /api/auth/me`,
  `GET /api/auth/csrf`, `POST /api/auth/logout`
- Safe error/status mapping
- Security headers
- Mocked adapters and backend security tests
- Preview acceptance runbook preparation only

## Excluded scope

- GIS frontend/login page
- Browser auth provider/state
- Dashboard route guards and browser role redirects
- Real Google login
- Live Upstash, Apps Script, or Vercel access
- Production deployment
- Phase 03C2 and Phase 03D
- Application CRUD, uploads, reports, or dashboard redesign

## Verification and acceptance

- Unit and endpoint tests for GIS issuer/signature/audience/expiry/nonce/time verification,
  canonical signing vectors, key rotation, cookies, CSRF, safe errors, and rate-limit
  failures/outages.
- Mocked local tests for Google, Redis, Apps Script, clock, crypto, and all authentication endpoints.
- Run formatting, lint, typecheck, all tests, Apps Script artifact checks, production build,
  frozen-dashboard Playwright regressions, credential scan, and `git diff --check`.
- Preview acceptance itself (real Google login, live Upstash/Apps Script) is out of scope for
  Phase 03C1 and belongs to Phase 03D.

Approval state: **Planned — awaiting owner instruction to implement.**
