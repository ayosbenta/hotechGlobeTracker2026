# Project Memory

Updated: 2026-09-14

## Identity

- Project: **Hotech Globe Tracker**
- Owner: Ryan Miranda
- Product: simple Globe Fiber application tracker
- Users: Admin, Agent, Processor
- UI: mobile-first responsive PWA with separate role portals

## Approved stack

- React + TypeScript + Vite
- Tailwind CSS, shadcn/ui, Lucide icons
- Google Sheets database
- Google Apps Script API
- Google Drive for private attachments
- Vercel deployment
- GitHub source control
- Codex implementation

## Approved scope

- Secure login and server-enforced RBAC
- Admin, Agent, and Processor portals
- Application create/view/edit according to role
- Admin assignment of Processor
- Status tracking and history
- Dashboard cards, charts, tables, search, and filters
- Valid-ID uploads to Google Drive
- Activity logs and basic reports
- Responsive installable PWA

## Statuses

`Pending → Transmitted → With Job Order → Ongoing → Installed`

Alternate outcomes: `Delayed`, `Cancelled/Rejected`.

- Delayed and Cancelled/Rejected require a reason.
- Every status change records actor, timestamp, previous/new status, and notes.

## Non-goals for V1

- Commissions, payouts, wallets
- Public referral links or QR tracking
- Complex automation
- Multiple branches
- Native mobile apps

## UI lock

The three PNGs in `design-references/` are the required dashboard direction. Preserve their hierarchy, blue/cyan visual system, card density, tables, charts, spacing, and role-specific menus. Do not substitute a generic admin template.

## Workflow state

- Brainstorming complete for MVP foundation.
- Phase 00 frontend foundation was Owner Approved on 2026-09-13 and is a frozen baseline.
- Foundation includes React + TypeScript + Vite, Tailwind, shadcn-compatible setup, Lucide, React Router, Recharts, PWA shell, typed portal routes, and Admin/Agent/Processor placeholders only.
- Tooling verification passed on 2026-09-13: clean install, formatting, lint, typecheck, 3 unit tests, production build, and Playwright overflow checks at 360, 390, 430, 768, and 1280 px.
- Dashboard reference images remain preserved for Phase 01.
- Phase 01 dashboard UI system was Owner Approved on 2026-09-14. The Admin, Agent, and Processor dashboards are frozen visual baselines; material UI changes require an explicit owner change request.
- Canonical dashboard routes are `/admin/dashboard`, `/agent/dashboard`, and `/processor/dashboard`; their short role routes redirect to the canonical paths.
- Phase 01 verification passed on 2026-09-14: formatting, lint, typecheck, 5 unit tests, production PWA build, and 18 Playwright checks across all role routes at 360, 390, 430, 768, and 1280 px.
- Phase 02 Apps Script and Google Sheets Foundation was Owner Approved on 2026-09-14 and is a frozen backend baseline; future material backend changes require an explicit owner change request.
- Phase 02 adds a typed, test-covered Apps Script foundation: exact Sheet-schema bootstrap, safe JSON envelopes, health-only public routing, UUID/request primitives, lock/version primitives, status-transition configuration, configuration validation, and append-only audit primitives.
- Phase 02 now has a deterministic esbuild Apps Script build: `gas:build` produces an ignored local `apps-script/generated/` directory containing only `Code.js` and `appsscript.json`; `gas:check` validates global entrypoints and artifact safety; `gas:test` runs Apps Script tests plus build/check.
- The generated bundle exposes global `doGet(e)`, `doPost(e)`, and editor-only `bootstrapSchema()` without unresolved modules, Node-only APIs, or source maps. Owner manual verification passed in isolated Apps Script V8: the bootstrap created all seven canonical tabs and exact headers; reruns produced no duplicate tabs/headers; conflicting non-empty headers failed without overwrite. No production resource or Web App deployment was used.
- Phase 02 does not connect the frontend or change the frozen dashboards; it does not implement authentication, sessions, RBAC, CRUD, uploads, Drive access, deployment, or persistent idempotency storage.
- Bootstrap targets only the pre-provisioned Script-Properties Sheet ID and is an Apps Script editor function, not a web endpoint. It is idempotent and rejects conflicting non-empty headers.
- Authentication, caller-based rate limiting, persistent idempotency storage, and CRUD mutation/audit recovery semantics remain deferred decisions for their respective phases. Phase 02 implements only request-ID propagation and reusable idempotency interfaces, with no persistent mutation/retry store.
- Phase 03A Auth Schema and Security Primitives was Owner Approved and frozen on 2026-09-14. It adds an editor-only, lock-protected append-only migration using `AUTH_SCHEMA_VERSION=phase-03a-v1`: the eight approved `Users` suffix columns, `Sessions`, and `InternalRequestReplays`; dependency-injected crypto/random adapters; auth-settings validation; and pure session/first-bind policy primitives. It exposes no authentication route, creates no live session, and makes no frontend/dashboard change.
- Phase 03B Apps Script Auth and Session Domain was Owner Approved and frozen on 2026-09-14. It adds internal-only canonical envelope/HMAC/key-ring/time validation, lock-protected durable replay, peppered session/CSRF hashes, authoritative user/session checks, first binding, audit/reconciliation, and editor-only isolated acceptance/cleanup; public web handlers remain unchanged. Final isolated Apps Script V8 acceptance passed all 10 checks with cleanup true. The first isolated run exposed unsupported `Utilities.getRandomBytes()`; it was removed from authored/generated code, production Apps Script validates/hashes BFF-created material only, and the editor suite uses deterministic non-secret vectors. A later harness CSRF handoff defect was corrected without changing production session behavior. The isolated project was not deployed, acceptance properties were removed, and exposed non-production secrets are prohibited from production reuse.
- Isolated Apps Script V8 and Google Sheet acceptance for Phase 03A passed: the migration preserved existing Users headers/values, appended the approved fields in exact order, defaulted only blank `session_version`/`failed_auth_count`, created exact new-tab headers, set the version only after verification, and was unchanged on rerun. Conflicting headers failed safely without overwrite or version advancement. No production resource was used. Final local checks passed: formatting, lint, typecheck, 29 unit tests (24 Apps Script; 7 Phase 03A-focused), generated-artifact build/check, production build, 18 Playwright regressions, credential scan, and Git diff check.
- Phase 03B Apps Script Auth and Session Domain is Owner Approved and frozen (2026-09-14).
- The detailed Phase 03C authentication architecture in `docs/PHASE_03C_AUTH_PLAN.md` is Owner Approved (2026-09-15) and binding. Phase 03C is split into Phase 03C1 (Vercel BFF Authentication Backend), Phase 03C2 (GIS Login UI and Frontend Authentication Guards), and Phase 03D (Isolated Vercel Preview End-to-End Security QA).
- Phase 03C1 Vercel BFF Authentication Backend was Owner Approved and frozen on 2026-09-15, limited to its approved local/mocked implementation scope. It adds `server/auth/` (typed envelopes, strict env validation, Node-crypto primitives, a byte-for-byte port of the frozen Phase 03B canonical signing algorithm, a Google ID-token verifier adapter, an Upstash Redis login-nonce store with atomic compare-and-delete consumption, a durable Upstash rate-limit adapter, cookie/CSRF utilities, an Origin-header defense-in-depth check, and an Apps Script internal HTTP client) and `api/auth/*.ts` (thin Vercel Node adapters) implementing all five BFF routes: `POST /api/auth/nonce`, `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/auth/csrf`, `POST /api/auth/logout`. New dependencies: `google-auth-library`, `@upstash/redis`, `@upstash/ratelimit`. No frontend UI, browser auth state, or dashboard change; no change to frozen Phase 00-03B behavior.
- Phase 03C1 verification passed on 2026-09-15: formatting, lint, typecheck, 142 unit tests (104 new server tests, including cross-runtime golden signing vectors verified against the frozen Apps Script verifier), Apps Script build/artifact checks, production build (browser bundle scanned clean of server secrets), 18 Playwright regressions, a credential/log-exposure scan, and `git diff --check`. No live external resource, push, or deployment occurred.
- **Phase 03C1 approval covers local/mocked BFF behavior only and does not claim live Apps Script integration.** Phase 03B's `executeInternalAuthPhase03B` remains an editor-only Apps Script function with no HTTP-exposed route; the BFF's Apps Script client is built and fully tested against the intended contract via mocks only. The five BFF routes cannot complete a real authentication flow until the separate prerequisite Phase 03C1A (Apps Script Internal Auth Ingress) exists; Phase 03C1A is planned only in `NEXT_TASK.md` and is not yet implemented.
- Phase 03C1 does not implement the GIS login screen, browser auth provider/state, dashboard route guards, real Google login, or any live Upstash/Apps Script/Vercel access — all remain Phase 03C1A/03C2/03D.
- Phase 03C1A Apps Script Internal Auth Ingress is implemented locally and Ready for Owner Review. It adds one new Web App route, `POST /v1/internal/auth`, dispatching an explicit four-operation allowlist (`login_first_bind`, `validate_session`, `issue_csrf`, `logout`) unchanged into the frozen `executeInternalAuthPhase03B`/`executeInternalAuth` Phase 03B domain, after strict ingress-only validation (path, `postData` presence, JSON media type with optional `charset=utf-8`, a 16 KiB UTF-8 byte-length limit, JSON parse, exact outer keys, and the allowlist) implemented in a new `apps-script/core/auth-ingress.ts` module. `rotate_session`, `revoke_session`, and all editor-only functions remain unreachable over HTTP; there is no dynamic/caller-keyed function dispatch. `doGet`/the health route and every frozen Phase 03A/03B module are unchanged. The BFF's `server/auth/apps-script-client.ts` now adds a 12-second `AbortController` timeout with no retry and maps the Apps Script JSON envelope's own `error.code` (`AUTH_DENIED`/`CONFLICT`/`INTERNAL_ERROR`) rather than collapsing every non-`ok:true` HTTP-200 body into one error type.
- Phase 03C1A verification passed locally on 2026-09-15: formatting, lint, typecheck, 172 unit tests total (57 Apps Script, including 24 new ingress tests; 30 new server/BFF-side tests across the client and boundary cases), `npm run gas:build`/`gas:check` against the updated artifact-check rules, a production build scanned clean of server secrets, and all 18 frozen-dashboard Playwright regressions. `git diff --check` reported no issues. No live Google/Upstash/Apps Script/Vercel resource was accessed, nothing was deployed, and no commit was made.
- Phase 03C1A's isolated non-production Apps Script Web App acceptance (§H of `NEXT_TASK.md`) has not been executed; it remains prepared-only and is the next step before this phase can be Owner Approved.
- Before that acceptance is executed, the acceptance tooling itself was remediated (2026-09-15): a repository-owned automated runner (`server/acceptance/env.ts`, `server/acceptance/phase-03c1a-runner.ts`, `scripts/run-phase-03c1a-acceptance.mjs`/`phase-03c1a-cli-entry.ts`, invoked via `npm run acceptance:phase-03c1a`) now automates all 12 cases in `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md` §3 plus an explicit `charset=utf-8` case, targeting only an explicitly configured isolated URL gated by a mandatory non-production confirmation literal and a required `/exec/v1/internal/auth` URL suffix, reusing the existing `server/auth/signing.ts` canonical signing implementation unchanged. It prints only a sanitized summary and scans every response for prohibited content before recording a result. 189/189 unit tests pass (was 172; +17 new), all other verification unchanged and passing. No acceptance was executed, nothing deployed, no approval state changed.
- **Roadmap consolidation (2026-09-15, owner change request).** The remaining roadmap is reduced to five MVP batches recorded in `docs/MVP_COMPLETION_PLAN.md` (proposed, not yet Owner Approved): MVP-1 Authentication Frontend, MVP-2 Core Tracker CRUD, MVP-3 Dashboard Live Data and Workflow Completion, MVP-4 Final Isolated Integration QA, MVP-5 Production Release. Old Phase 03C2 becomes MVP-1; old Phase 03D is absorbed into MVP-4. Deferred post-MVP: uploads/Drive, advanced reports, notifications, bulk import/export, advanced reconciliation UI, nonessential admin customization. All Owner Approved/frozen phases (00, 01, 02, 03A, 03B, 03C1) are preserved unchanged.
- The manual Phase 03C1A isolated acceptance setup is **stopped**; no resource from that attempt is reused. Live ingress acceptance is deferred and merged into MVP-4's single isolated integration QA (one fresh isolated Sheet/Apps Script project plus one Vercel Preview, covering ingress acceptance, real non-production GIS login, cookies/CSRF/sessions/RBAC, CRUD and status workflow, dashboard regressions, then teardown). Rationale: avoid standing up and tearing down two near-identical isolated environments.
- Phase 03C1A remains **Ready for Owner Review** until MVP-4's QA passes. Its ingress implementation, 189 passing tests, acceptance runner, and security controls are preserved in full and must not be deleted or weakened.
- Current task is always in `NEXT_TASK.md`.
- Owner approval is required before a phase is marked FINAL.
