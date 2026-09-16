# Next Task — awaiting owner review of the password-auth migration plan (D-049)

**Pending owner decision, blocking further implementation on the auth path:** an owner change
request to replace GIS/OIDC login with Admin-managed password authentication is recorded as D-049,
with a full planning-only impact report in `docs/PASSWORD_AUTH_IMPACT_PLAN.md`. No code has been
changed. MVP-4's live external-resource provisioning (below) is unaffected by this and may proceed
in parallel, but its "Google OAuth Web Client" step and its GIS-login manual acceptance case will
need to be redone once/if the password-auth migration is approved and implemented — provisioning
that one specific resource now would be wasted if the migration proceeds. The owner should read
`docs/PASSWORD_AUTH_IMPACT_PLAN.md` and confirm whether to proceed with implementation, and resolve
its four open judgment calls, before that work begins.

MVP-2A-2F and MVP-3 are implemented locally (MVP-3 trend-chart fix D-047 applied). MVP-4's local
acceptance tooling (`npm run acceptance:mvp4`, `docs/MVP4_ACCEPTANCE_RUNBOOK.md`) is now prepared
and unit-tested — see "MVP-4 local tooling result" below — but no live isolated Sheet/Apps
Script/Vercel resource has been created or exercised. The next step is entirely external: a human
owner must provision the isolated resources listed in `docs/MVP4_ACCEPTANCE_RUNBOOK.md` §1 before
`npm run acceptance:phase-03c1a` and `npm run acceptance:mvp4` can be run for real.

Roadmap reference: **`docs/MVP_COMPLETION_PLAN.md`** — Owner Approved (2026-09-15), along with
decisions D-035/D-036.
Previous batch: **MVP-1 Authentication Frontend — Owner Approved and frozen (2026-09-16).**
Frozen baseline reused by this batch: Phase 02 Sheets/Apps Script foundation (schema, locks,
versioning, status-transition matrix, audit primitives — see `apps-script/core/schema.ts`,
`versioning.ts`, `lock.ts`, `audit.ts`, `status-transitions.ts`), and the frozen Phase 03A/03B/03C1
authentication chain MVP-1 now fronts.

Status: **MVP-2A through MVP-2F and MVP-3 (Dashboard Live Data) all implemented locally as
checkpoint commits (2026-09-16); not Owner Approved.** MVP-2 Core Tracker CRUD is fully implemented
(backend/API-only, per §K), and MVP-3 wires the frozen dashboards to that live data (D-045). MVP-4
Final Isolated Integration QA is next and not started. See "MVP-2 — Core Tracker CRUD (planned)"
below for the full specification, and the per-batch result sections for what was actually built and
verified. MVP-3's own result section is recorded at the end of this file.

## Roadmap change (2026-09-15, Owner Approved)

The remaining roadmap is consolidated into five MVP batches (MVP-1 Authentication Frontend, MVP-2
Core Tracker CRUD, MVP-3 Dashboard Live Data, MVP-4 Final Isolated Integration QA, MVP-5
Production Release). Old Phase 03C2 becomes MVP-1; old Phase 03D is absorbed into MVP-4. See
`docs/MVP_COMPLETION_PLAN.md` for the full status table, reconciliation and estimates.

**The manual Phase 03C1A isolated acceptance setup is stopped.** Live ingress acceptance is
deferred and will be performed once, as part of MVP-4's single isolated integration QA, rather
than as its own standalone environment + teardown. No resource created during the stopped attempt
is reused.

## Phase 03C1A status (unchanged approval state)

**Ready for Owner Review. Not Owner Approved. Not FINAL.** It remains Ready for Owner Review until
MVP-4's isolated QA executes and passes its acceptance. Its implementation, tests, and security
controls are preserved in full and must not be weakened:

- The `POST /v1/internal/auth` ingress, its four-operation allowlist, and all ingress validation.
- All 189 passing unit tests at the time of its own commit, including the 24 ingress tests and 17
  acceptance-tooling tests.
- The `npm run acceptance:phase-03c1a` runner, its fail-closed config guards, and its sanitized
  output — to be used unchanged during MVP-4.

Phase 03C1A and the MVP roadmap docs are committed locally (not pushed) as two separate commits:
`feat(phase-03c1a): add internal auth ingress and acceptance tooling` and
`docs(mvp): consolidate remaining implementation roadmap`. Neither commit changes Phase 03C1A's
approval state.

The detailed Phase 03C1A implementation record is preserved further below for review.

---

## MVP-2 — Core Tracker CRUD (planned)

**Status: planning only. Not implemented. Not started.** This section is the specification that
must be reviewed before any MVP-2 code is written, per `docs/MVP_COMPLETION_PLAN.md` §4.

### Why this is split into six internal batches

MVP-2 is the largest remaining batch (estimated 4–6 sessions in the roadmap). Splitting it keeps
each batch reviewable and independently verifiable, and lets RBAC/versioning/audit patterns get
proven once (MVP-2A) before being repeated across the remaining entity/role surfaces.

| Batch | Scope | Depends on | Status |
| --- | --- | --- | --- |
| MVP-2A | Shared contracts, Apps Script repository layer, Admin Plans CRUD | MVP-1 (auth ingress pattern) | **Implemented locally, checkpoint commit. Not Owner Approved.** |
| MVP-2B | Admin Users/role assignments and account-status management | MVP-2A (repository layer) | **Implemented locally, checkpoint commit. Not Owner Approved.** |
| MVP-2C | Applications create/read/update foundation | MVP-2A, MVP-2B (agent/processor assignment needs Users) | **Implemented locally, checkpoint commit. Not Owner Approved.** |
| MVP-2D | Agent own-application workflow (create, view own) | MVP-2C | **Folded into MVP-2C's implementation (D-043) — full RBAC was built from the start.** |
| MVP-2E | Processor queue/assignment/status transitions | MVP-2C, MVP-2D | **Folded into MVP-2C's implementation (D-043) — full RBAC was built from the start.** |
| MVP-2F | Integration verification, audits, and regression across 2A–2E | MVP-2A..2E | **Implemented locally, checkpoint commit. Not Owner Approved.** |

### MVP-2A result (2026-09-16)

Implemented and locally verified per the spec below, as a checkpoint commit (not Owner Approved —
see D-039). Summary:

- `apps-script/core/contracts.ts`: added the explicit `CrudOperation` union (`plans_list` |
  `plans_create` | `plans_update`) and `PlanRecord`/`PlanStatus` types. No dynamic/caller-keyed
  dispatch, mirroring `auth-domain.ts`'s `Operation` union.
- `apps-script/core/plans-repository.ts` (new): header-addressed `PlansRepository` (list/find/
  create/update) over the frozen `Plans` sheet, following `sheet-auth-store.ts`'s shape.
- `apps-script/core/crud-domain.ts` (new): `executeCrud(operation, envelope, deps)` — verifies the
  signed envelope with the same `verifyEnvelope` auth uses, requires a valid session for every
  operation via two additive exports from `auth-domain.ts` (`resolveAuthenticatedActor`,
  `requireSessionCsrf`, wrapping the previously private `validSession`/CSRF check unchanged),
  derives the actor `{userId, role}` only from the session, and enforces RBAC: `plans_list` scopes
  non-Admins to `plan_status=Active`; `plans_create`/`plans_update` require Admin. Every mutation
  appends one `Activity_Logs` row via the unchanged `appendActivityLog`.
- `apps-script/core/crud-ingress.ts` (new): strict ingress mirroring `auth-ingress.ts` exactly
  (path/postData/media-type/16 KiB/JSON/outer-key/allowlist validation) for the new
  `POST /v1/internal/crud` route, wired into `handlePost`/`doPost` as a second allowlisted route
  alongside `/v1/internal/auth` — never a second unauthenticated entrypoint. `doGet` and the
  frozen auth route are unchanged; `gas:check` was extended to enforce this.
- Optimistic concurrency: the frozen Phase 02 `Plans` schema has no `version` column, so Plans use
  `updated_at` as the client-supplied concurrency token (`expected_updated_at`) instead of
  `assertCurrentVersion`, which remains reserved for `Applications.version` per schema. A mismatch
  raises `CrudConflictError` → `CONFLICT`, matching §F's intent.
- Pagination: 25-row default / 50-row max page size, numeric-offset cursor via the existing
  `ApiMeta.nextCursor` — no new pagination shape.
- BFF: `server/crud/apps-script-crud-client.ts` (new signed-envelope client mirroring
  `apps-script-client.ts`, posting to a new `APPS_SCRIPT_CRUD_URL` env var — a sibling route on the
  same Apps Script deployment, reusing the existing HMAC key ring/audience, not a new trust
  boundary) and `server/crud/routes/plans.ts` implementing `GET/POST /api/plans` and
  `PATCH /api/plans/:planId` (`api/plans/index.ts`, `api/plans/[planId].ts`). All routes require the
  session cookie; mutations additionally require CSRF double-submit and an Origin check. Responses
  use the existing `BffResponse<T>` envelope; errors map onto the existing `BffErrorCode` taxonomy
  (no new codes) — `AUTH_DENIED`→`SESSION_EXPIRED`, `VALIDATION_ERROR`→`VALIDATION_ERROR`,
  `FORBIDDEN`→`FORBIDDEN`, `NOT_FOUND`→`NOT_FOUND`, `CONFLICT`→`REPLAY_OR_CONFLICT`.
- No frontend/dashboard file was touched; `DashboardShell` navigation remains inert, per §K.

**Verification (local; no live external resource used):** 96/96 Apps Script tests (was 57, +39:
12 CRUD-domain, 24 CRUD-ingress, 3 Plans-repository), 300/300 total unit tests (was 240, +60: the
39 above + 20 new BFF Plans-route tests + 1 new env test), `npm run format`/`format:check`,
`npm run lint` (0 errors, same one pre-existing warning), `npm run typecheck`, `npm run gas:build`/
`gas:check` (both updated to require the new route/entrypoint and to confirm `doGet` still never
reaches it), `npm run build` (production bundle scanned clean of secrets, including the new
`APPS_SCRIPT_CRUD_URL`), `npx playwright test` (19/19 unchanged), a credential/secret grep over the
diff (clean), and `git diff --check` (clean, only benign CRLF-conversion warnings). Committed
locally (not pushed) as `feat(mvp-2a): implement plans crud foundation`.

**Known limitations:** local/mocked only — no live Apps Script deployment, live Google/Upstash, or
Vercel Preview was used; that remains MVP-4. `plans_update`'s allowed-fields set is the full Plans
entity (name/price/speed/status) per §D; no separate deactivate-only endpoint was added. MVP-2A
does not implement Users, Applications, or any other MVP-2B–2F scope.

### MVP-2B result (2026-09-16)

Implemented and locally verified per the spec below, as a checkpoint commit (not Owner Approved —
see D-039/D-042). Summary:

- `apps-script/core/contracts.ts`: extended `CrudOperation` with `users_list`/`users_update`, and
  added `UserRecord`/`UserRole`/`UserAccountStatus` types. Confirmed against `schema.ts` that the
  frozen `Users` sheet has no `version` column, so — per D-041's precedent — Users reuse the exact
  same `updated_at`-token optimistic concurrency pattern as Plans.
- `apps-script/core/users-repository.ts` (new): header-addressed `UsersRepository` (list with
  role/account_status filters, findById, countActiveAdmins, update) over the frozen `Users` sheet's
  eight base columns, following `PlansRepository`'s shape. It is a separate, non-overlapping
  read/patch adapter from `SheetAuthStore`, which owns the auth-suffix columns and session logic.
- `apps-script/core/crud-domain.ts`: extended (not replaced) — `users_list` requires Admin and
  supports `role`/`account_status` filters using the same pagination as `plans_list`. `users_update`
  implements the full write-authorization policy: an Admin may change any user's
  role/account_status/profile fields; any authenticated user (Admin/Agent/Processor) may update only
  their OWN `full_name`/`mobile_number` through the same operation when `user_id` matches their
  session's `userId`; a non-Admin attempting a role/account_status change (even on their own row) is
  rejected with `CrudForbiddenError`. An Admin may never move their own role away from Admin through
  this route (self-escalation-away block, `CrudForbiddenError`). Before applying a role change away
  from Admin or an account_status change off Active on a row that is currently an active Admin, the
  domain counts remaining active Admins excluding that row; if it would reach zero, the mutation is
  rejected with a new `CrudLastAdminError` (extends `CrudValidationError`, classified
  `VALIDATION_ERROR` — chosen over `FORBIDDEN` because the acting Admin IS authorized to edit Users;
  the request is simply invalid, reusing the existing safe-error taxonomy per §I without inventing a
  new `ErrorCode`). Every mutation runs under the existing `withScriptLock` and appends one
  `Activity_Logs` row (`USER_UPDATE`) via the unchanged `appendActivityLog`.
- `apps-script/core/crud-ingress.ts`: `ALLOWED_OPERATIONS` extended with `users_list`/`users_update`
  — no new route; `POST /v1/internal/crud` is reused exactly as MVP-2A wired it.
- `apps-script/Code.ts`: `executeCrudPhase2A` now also constructs a `UsersRepository` over the
  `Users` sheet and passes it into `executeCrud`'s dependencies.
- BFF: `server/crud/routes/users.ts` (`handleListUsersRoute`, `handleUpdateUserRoute`) and
  `api/users/index.ts`/`api/users/[userId].ts`, mirroring the Plans route files' structure exactly
  — same `BffResponse<T>` envelope, session-cookie + CSRF double-submit + Origin check on mutations,
  and the unchanged `BffErrorCode` taxonomy (no new codes). `server/crud/apps-script-crud-client.ts`
  and `server/auth/route-types.ts`/`env.ts` already declared `users_list`/`users_update` and
  `APPS_SCRIPT_CRUD_URL` from MVP-2A's forward-looking types, so only the `CrudOperation` union and
  its `OPERATION_PATHS` entries needed extending in the BFF crud client. Two new rate-limit buckets
  (`users-read`, `users-write`) were added to `server/auth/rate-limit.ts`, following the
  `plans-read`/`plans-write` pattern exactly.
- No frontend/dashboard file was touched; `DashboardShell` navigation remains inert, per §K.

**Verification (local; no live external resource used):** 118/118 Apps Script tests (was 96, +22:
5 Users-repository, plus crud-domain/crud-ingress cases covering RBAC allow/deny per role,
self-escalation block, last-admin block on both role-change and account-status-change paths,
concurrency conflict, not-found, invalid-mobile-number validation, missing-CSRF, and audit-row
shape), 342/342 total unit tests (was 300, +42: the 22 above + 20 new BFF users-route tests),
`npm run format`/`format:check`, `npm run lint` (0 errors, same one pre-existing warning),
`npm run typecheck`, `npm run gas:build`/`gas:check` (both pass unchanged — no new route was added,
so no artifact-check update was needed), `npm run build` (production bundle scanned clean of
secrets), `npx playwright test` (19/19 unchanged), a credential/secret grep over the diff (clean),
and `git diff --check` (clean, only benign CRLF-conversion warnings). Committed locally (not
pushed) as `feat(mvp-2b): implement user administration`.

**Known limitations:** local/mocked only — no live Apps Script deployment, live Google/Upstash, or
Vercel Preview was used; that remains MVP-4. `users_update`'s allowed-fields set matches §D exactly
(role, account_status, full_name, mobile_number); no separate Users-create endpoint was added
(Users remain pre-provisioned per the frozen Phase 03A first-bind flow, unchanged by this batch).
MVP-2B does not implement Applications or any other MVP-2C–2F scope.

### MVP-2C/2D/2E result (2026-09-16)

Implemented and locally verified together as one checkpoint commit (not Owner Approved — see
D-039/D-043), since a single `ApplicationsRepository` and a single set of `crud-domain.ts` handlers
implement the full §B-§D role RBAC matrix from the start, so MVP-2D/2E added no separate
implementation pass. Summary:

- `apps-script/core/contracts.ts`: extended `CrudOperation` with `applications_list`/`_get`/
  `_create`/`_update`/`_assign`, and added `ApplicationRecord` (22 fields matching the frozen
  schema).
- `apps-script/core/applications-repository.ts` (new): header-addressed `ApplicationsRepository`
  (list with agentId/processorId/currentStatus filters, findById, create, update), following
  `PlansRepository`'s shape.
- `apps-script/core/crud-domain.ts`: extended with `listApplications` (Admin sees all with optional
  filters; Agent forced to their own `agentId`; Processor forced to their own `processorId` — a
  client-supplied `agent_id`/`processor_id` filter is never trusted as authorization for a
  non-Admin, confirmed by a dedicated test), `getApplication` (role-scoped read, `FORBIDDEN` — never
  `NOT_FOUND` — for a row the actor may not read), `createApplication` (Admin/Agent only; an Agent's
  `agent_id` is always session-derived; an Admin must supply an explicit `agent_id` validated to
  reference an existing Agent-role user; `plan_id` must reference an existing Active Plan, whose
  name/price are snapshotted at write time; `current_status` always starts `Pending` server-side;
  one `Status_History` row is appended alongside the `Activity_Logs` row), `updateApplication`
  (Admin may edit core fields and/or trigger a transition; Agent may edit core fields only on their
  own `Pending` application; Processor may only trigger a transition on their assigned application,
  via the frozen `validateTransition` called unchanged, with assigned-only authorization checked
  before it), and `assignApplication` (Admin-only, validates the target is an existing
  `role=Processor`/`accountStatus=Active` user).
- Applications use the frozen `assertCurrentVersion`/`version` column (not the `updated_at`-token
  pattern) since the schema has a real `version` column — a stale version throws
  `CrudConflictError` → `CONFLICT`.
- `apps-script/core/crud-ingress.ts`: `ALLOWED_OPERATIONS` extended with the five `applications_*`
  operations — no new route.
- `apps-script/Code.ts`: `executeCrudPhase2A` now also constructs an `ApplicationsRepository` over
  the `Applications` sheet and a `Status_History` sheet reference, passed into `executeCrud`.
- BFF: `server/crud/routes/applications.ts` (`handleListApplicationsRoute`,
  `handleGetApplicationRoute`, `handleCreateApplicationRoute`, `handleUpdateApplicationRoute`,
  `handleAssignApplicationRoute`) and `api/applications/index.ts`,
  `api/applications/[applicationId].ts`, `api/applications/[applicationId]/assign.ts`, mirroring
  the Plans/Users route files exactly. `applications-read`/`applications-write` rate-limit buckets
  were added to `server/auth/rate-limit.ts`.
- No frontend/dashboard file was touched; `DashboardShell` navigation remains inert, per §K.
- No shared Processor claim queue was implemented — Processor assignment remains Admin-only,
  consistent with that item remaining an explicit open decision in `docs/DECISIONS.md`.

**Verification (local; no live external resource used):** 139/139 Apps Script tests (was 118, +21:
4 ApplicationsRepository, 17 CRUD-domain Applications cases covering RBAC scoping, ownership
enforcement, Pending-only Agent edits, Processor-assigned-only transitions, frozen-transition-graph
validation, job-order-number requirement, stale-version conflict, and Admin-only assignment with
Processor-role/Active-status validation), 390/390 total unit tests (was 342, +48: the 21 above + 27
new BFF applications-route tests), `npm run format`/`format:check`, `npm run lint` (0 errors, same
one pre-existing warning), `npm run typecheck`, `npm run gas:build`/`gas:check` (both pass unchanged
— no new route was added), `npm run build` (production bundle scanned clean of secrets),
`npx playwright test` (19/19 unchanged), a credential/secret grep over the diff (clean), and
`git diff --check` (clean, only benign CRLF-conversion warnings). Committed locally (not pushed) as
`feat(mvp-2c): implement applications crud foundation`.

**Known limitations:** local/mocked only — no live Apps Script deployment, live Google/Upstash, or
Vercel Preview was used; that remains MVP-4. No Attachments/uploads were implemented (deferred
post-MVP per the roadmap).

### MVP-2F result (2026-09-16)

Reviewed the RBAC matrix, concurrency, lock-conflict, and audit-row-shape coverage already
accumulated across MVP-2A/2B/2C and found it already comprehensive per D-044: every §B role x
action combination has an explicit allow/deny test, both concurrency primitives have stale-value
tests, the frozen `validateTransition` graph has explicit-rejection tests, and every mutation's
`Activity_Logs`/`Status_History` row shape is asserted. The one gap found — no test proving a
lock-acquisition failure propagates unchanged through `executeCrud` for more than one entity — was
closed with one new test. No frontend/dashboard file was touched, per §K; all Playwright regressions
pass unmodified. Verification: 140/140 Apps Script tests (+1), 391/391 total unit tests (+1), all
other gates unchanged and passing. Committed locally (not pushed) as
`test(mvp-2f): verify core tracker workflows`. See D-044.

Each batch ends in a working, independently testable slice; none is implemented until explicitly
instructed, batch by batch.

### Architecture: extending the frozen ingress, not replacing it

MVP-2 reuses the **same** signed-envelope pattern Phase 03C1A established for auth, applied to a
new Apps Script Web App route (or an extension of the existing dispatcher — exact routing decided
at MVP-2A implementation time, but never a second unauthenticated entrypoint):

- A new `CrudOperation` union (mirroring `apps-script/core/auth-domain.ts`'s `Operation` union) —
  an explicit allowlist, never a dynamic/caller-keyed dispatch.
- Every CRUD operation requires a **valid session** (via the frozen `validSession`/`validateSession`
  check already in `auth-domain.ts`) before touching any Sheet data — there is no CRUD path that
  skips authentication.
- The BFF gains new `/api/applications/*`, `/api/users/*`, `/api/plans/*` routes (Vercel), each a
  thin adapter that forwards a signed internal envelope to Apps Script exactly like
  `server/auth/apps-script-client.ts` does today, extended with new operation names.
- `AuthenticatedActor` (`apps-script/core/contracts.ts`, already reserved but unused) becomes the
  authoritative actor: Apps Script derives `{ userId, role, email }` from the validated session,
  never from a client-supplied field, for every CRUD call.

### A. Exact route/API contracts (BFF, Vercel)

All routes require a valid `__Host-hotech_session` cookie (checked authoritatively via the same
Apps Script `validate_session` operation MVP-1 already calls) and, for every mutating
(`POST`/`PATCH`/`DELETE`) route, the existing CSRF double-submit header (`X-CSRF-Token` matching
the `__Host-hotech_csrf` cookie). Every response uses the existing `BffResponse<T>` envelope shape
(`server/auth/http-envelope.ts`) — no new envelope shape.

| Route | Method | Role(s) | Purpose |
| --- | --- | --- | --- |
| `/api/plans` | GET | Admin, Agent, Processor | List plans (Agent/Processor: `plan_status = Active` only) |
| `/api/plans` | POST | Admin | Create a plan |
| `/api/plans/:planId` | PATCH | Admin | Update a plan (price/speed/status); optimistic version required |
| `/api/users` | GET | Admin | List users, paginated/filterable |
| `/api/users/:userId` | PATCH | Admin | Update role, account status, or Processor assignment eligibility |
| `/api/applications` | GET | Admin, Agent, Processor | List applications, scoped per role (§B) |
| `/api/applications/:applicationId` | GET | Admin, Agent (own), Processor (assigned) | Read one application |
| `/api/applications` | POST | Admin, Agent | Create an application |
| `/api/applications/:applicationId` | PATCH | Admin, Agent (own, Pending only), Processor (assigned) | Update fields and/or status (§C) |
| `/api/applications/:applicationId/assign` | POST | Admin | Assign/reassign a Processor |

Exact request/response field lists are finalized at each batch's implementation time against this
contract; this table fixes the route surface, methods, and role gate, which is the part that must
not silently drift once implementation starts.

### B. Authoritative RBAC matrix

RBAC is enforced **only** in Apps Script, from the session-derived `AuthenticatedActor`. The BFF
and frontend may pre-filter for UX, but a client-side check is never authoritative.

| Action | Admin | Agent | Processor |
| --- | --- | --- | --- |
| View all applications | ✅ | ❌ (own only) | ❌ (assigned/available only) |
| View own/assigned applications | ✅ | ✅ (own) | ✅ (assigned) |
| Create application | ✅ | ✅ | ❌ |
| Edit application core fields (customer/address/plan) | ✅ | ✅ (own, `Pending` only) | ❌ |
| Change application status | ✅ (any allowed transition) | ❌ | ✅ (assigned only, allowed transitions per §C) |
| Assign/reassign Processor | ✅ | ❌ | ❌ |
| Manage Plans | ✅ | ❌ (read Active only) | ❌ (read Active only) |
| Manage Users (create/role/status) | ✅ | ❌ | ❌ |
| View Status_History | ✅ (any) | ✅ (own applications) | ✅ (assigned applications) |

An Agent may only ever query/mutate rows where `agent_id` equals their own `userId`. A Processor
may only ever query/mutate rows where `processor_id` equals their own `userId`. Both are enforced
by filtering in the Apps Script repository layer against the authoritative `userId`, never by
trusting a client-supplied `agent_id`/`processor_id` filter as authorization.

### C. Application status-transition matrix (implementation of the already-frozen policy)

`apps-script/core/status-transitions.ts` already implements the transition graph and validation
rules (forward chain, Delayed/Cancelled branches, notes/job-order/installed-at requirements) and
is **frozen — MVP-2 must call it unchanged, not reimplement it.** MVP-2's job is wiring authority
around it:

| From → To | Allowed actor(s) | Extra requirement (already enforced by `validateTransition`) |
| --- | --- | --- |
| Pending → Transmitted | Admin, assigned Processor | — |
| Transmitted → With Job Order | Admin, assigned Processor | `job_order_number` |
| With Job Order → Ongoing | Admin, assigned Processor | `job_order_number` carried forward |
| Ongoing → Installed | Admin, assigned Processor | `job_order_number`, `installed_at` |
| Pending/Transmitted/With Job Order/Ongoing → Delayed | Admin, assigned Processor | `notes` |
| Pending/Transmitted/With Job Order/Ongoing → Cancelled/Rejected | Admin, assigned Processor | `notes` |
| Delayed → (its prior status) | Admin, assigned Processor | `delayedFromStatus` matches history |
| Cancelled/Rejected → Pending | Admin only (`canReopenCancellation`) | — |

Every transition is authorized (is this actor allowed to act on this application at all, per §B)
**before** `validateTransition` is even called; `validateTransition`'s own return only decides
whether the specific transition shape is valid, never who may attempt it.

### D. Allowed fields per role (write authorization, not just route authorization)

| Entity | Admin-writable | Agent-writable (own, Pending only) | Processor-writable (assigned) |
| --- | --- | --- | --- |
| Applications: customer/address/plan fields | ✅ | ✅ | ❌ |
| Applications: `current_status` + transition metadata | ✅ | ❌ | ✅ (allowed transitions only) |
| Applications: `agent_id` | ✅ (reassign) | ❌ | ❌ |
| Applications: `processor_id` | ✅ (assign) | ❌ | ❌ |
| Applications: `notes` | ✅ | ✅ (own, Pending) | ✅ (as part of a status transition) |
| Plans: all fields | ✅ | ❌ (read Active only) | ❌ (read Active only) |
| Users: role, account_status | ✅ | ❌ | ❌ |
| Users: own profile (`full_name`, `mobile_number`) | ✅ (any) | ✅ (own) | ✅ (own) |

Any field not listed as writable by the caller's role is silently ignored server-side if present
in a request body — never a client-controlled priority write. Ignoring vs. rejecting an
unauthorized field is decided per batch (leaning toward rejecting with `VALIDATION_ERROR` for
clarity, finalized at MVP-2A).

### E. Validation rules (frozen-schema-driven, finalized per batch)

- Every string field has a required/optional flag and a max length matching realistic Sheet-cell
  content (exact limits fixed at each batch's implementation time; e.g. `customer_full_name`
  required non-empty, `notes` optional up to a bounded length).
- `mobile_number` and `email` use the same normalization/shape rules already established for Users
  in the frozen schema and Phase 03 auth (`normalizeEmail` in `apps-script/core/first-bind.ts` is
  reused for any email comparison — never reimplemented).
- `plan_id` on an Application must reference an existing, `Active` Plan at creation time; the
  `plan_name_snapshot`/`monthly_price_snapshot` columns are populated from that Plan at write time
  and are never edited directly afterward (they are a snapshot, not a live join).
- No request is ever trusted for `agent_id`, `processor_id`, `current_status` (on create), or any
  audit/version/timestamp column — those are always server-derived.

### F. Optimistic concurrency / version behavior

Applications (which have a `version` column in the frozen Phase 02 schema) reuse
`apps-script/core/versioning.ts`'s frozen `assertCurrentVersion` unchanged:

- Every mutating request to an existing Applications row includes the `version` the client last
  read.
- `assertCurrentVersion` throws `StaleVersionError` on any mismatch; the ingress classifies this as
  `CONFLICT` (matching the frozen Phase 03C1A error-classification pattern), never silently
  overwriting a concurrent edit.
- On success, `version` increments by exactly 1 and the new value is returned to the caller.
- Creation operations do not use this check (no prior version exists); the created row starts at
  `version = 1`.

**Plans have no `version` column in the frozen Phase 02 schema (D-041, correcting the earlier
assumption this section made before MVP-2A implementation).** Plan mutations instead use the row's
exact current `updated_at` value as the optimistic concurrency token:

- Every mutating request to an existing Plan includes the `expected_updated_at` value the client
  last read.
- Under the same `withScriptLock` used for every mutation, the authoritative row's current
  `updated_at` is compared byte-for-byte against `expected_updated_at`; any mismatch is classified
  `CONFLICT`, never silently overwriting a concurrent edit — same fail-safe behavior as
  `StaleVersionError`, just keyed on `updated_at` instead of an integer `version`.
- On success, `updated_at` is set to a new authoritative value (server-generated, never
  client-supplied) and returned to the caller as the new token for the next mutation.
- Creation operations do not use this check (no prior row exists).
- This pattern is specific to Plans. Any future entity without a `version` column follows the same
  `updated_at`-token approach; any entity with a `version` column uses `assertCurrentVersion`
  unchanged.

### G. Locking and audit behavior

- Every mutation acquires `apps-script/core/lock.ts`'s frozen `withScriptLock` around its
  read-check-write sequence, exactly as `bootstrapSchema`/`executeInternalAuthPhase03B` already do.
  A lock timeout is classified `CONFLICT`, matching the frozen pattern.
- Every mutation appends exactly one `Activity_Logs` row via the frozen `appendActivityLog`
  (`apps-script/core/audit.ts`), with `actorUserId` from the authoritative session, `action`
  naming the operation (e.g. `APPLICATION_STATUS_CHANGE`), and `metadata` carrying only safe,
  non-secret fields (never a raw request body).
- Every application status change additionally appends one `Status_History` row (frozen schema),
  recording `from_status`, `to_status`, `notes`, `job_order_number`, `actor_user_id`, `request_id`,
  and `occurred_at` — this is the authoritative history trail, independent of `Activity_Logs`.
- Mutation audit ordering/compensation/recovery semantics follow D-014's existing constraint:
  append-only, no Sheet transaction guarantees beyond the script lock; a mid-mutation failure after
  the lock is released is surfaced as `INTERNAL_ERROR` and does not silently retry.

### H. Pagination and filtering

- List endpoints (`GET /api/applications`, `GET /api/users`, `GET /api/plans`) use the existing
  `ApiMeta.nextCursor` cursor field already defined in `apps-script/core/contracts.ts` — no new
  pagination shape invented.
- Filtering is allowlisted per endpoint (e.g. `current_status`, `agent_id` for Admin, date range)
  and always applied server-side against the role-scoped result set from §B, never as a
  client-supplied override of that scope.
- A reasonable fixed page size is chosen per batch at implementation time (e.g. 25–50 rows) and
  documented in that batch's own task record.

### I. Safe errors

Reuses the existing `ErrorCode`/`ApiFailure` shape from `apps-script/core/contracts.ts`
(`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`,
`INTERNAL_ERROR`) and the BFF's existing `BffErrorCode`/status mapping
(`server/auth/http-envelope.ts`) — no new error taxonomy. `FORBIDDEN` is used for both "wrong role"
and "not your row" (never disclosing which, to avoid confirming row existence to an unauthorized
caller). No raw exception message, Sheet ID, row index, or internal identifier is ever returned.

### J. Tests and isolated acceptance

- Mocked/local unit tests for every new Apps Script operation (RBAC allow/deny per role, every
  transition-matrix edge already covered by `apps-script/test/`-style fixtures, version-conflict,
  lock-conflict, and audit-row-shape assertions) and every new BFF route (same mocked-fetch pattern
  as `server/test/routes/*.test.ts`).
- No live Google/Apps Script/Vercel access during MVP-2A–2E; MVP-2F is integration verification
  **still using local/mocked fixtures**, not a live environment — the one live isolated QA pass for
  all of MVP-1–3 remains MVP-4, per the roadmap's explicit goal of avoiding a second isolated setup.
- Frozen-dashboard Playwright regressions must still pass unmodified at the end of every batch.

### K. Frozen UI constraints

- No change to the frozen dashboard visual baseline (Phase 01) beyond what MVP-3 explicitly scopes
  (live data). MVP-2 is backend/API-only; any UI needed to exercise it manually (e.g. a bare form)
  is deferred to MVP-3 unless a batch explicitly and narrowly requires a minimal UI hook, decided
  at that batch's own planning step — never assumed in advance.
- `DashboardShell`'s navigation items (Applications, Agents, Processors, Plans, etc. — already
  present as inert labels per Phase 01) are not wired to real routes/pages during MVP-2; that
  remains MVP-3's job.

---

## MVP-1 — Authentication Frontend (Owner Approved, frozen)

**Owner Approved and frozen (2026-09-16).** Committed locally (not pushed) as
`feat(mvp-1): implement approved authentication frontend`.

Approval scope: GIS login frontend and nonce lifecycle, frontend auth provider/state, canonical
role-protected routes, safe role redirects, the minimal logout control, and safe
authentication/account/session error states — verified locally and via mocks only.

This approval does **not** claim: real Google login verification, live Apps Script ingress
verification, live Upstash integration, Vercel Preview cookie/CSRF validation, or production
readiness/deployment. Those remain deferred to MVP-4.

**Future material changes to the login screen or dashboard-auth UI (route guards, auth provider
behavior, session/error-state handling, or the logout control) require an explicit owner change
request**, matching the frozen-phase convention already used for Phase 00/01/02/03A/03B/03C1.

### Focused review/remediation (2026-09-16)

A follow-up review against the MVP-1 spec found and fixed three real defects, and added a minimal
logout control per an explicit owner change request. No CRUD, uploads, reports, Apps Script, or
BFF server-domain code was touched.

**Findings:**

1. **Unsafe post-login destination.** `LoginPage` redirected to `location.state.from` — an
   arbitrary router-supplied string — without checking it against the newly authenticated user's
   own role. A visitor who first tried `/admin/dashboard` while signed out could be sent there
   after logging in as an Agent. Fixed with `safeDestinationForRole()`
   (`src/routes/constants.ts`): only the three canonical dashboard paths are ever considered, and
   only when the path belongs to the authenticated user's own role; anything else (short routes,
   root, external/protocol-relative URLs, query-controlled strings, non-string values) falls back
   to that role's own canonical dashboard. `ProtectedRoute` was also tightened to only ever store
   its own canonical path as the attempted destination, never the raw `location.pathname`.
2. **No concurrent-login guard.** The GIS credential callback in `LoginPage` had no protection
   against firing twice (double-click, or a stray re-invocation) while a login was already in
   flight. Fixed with an in-flight ref guard that ignores a second callback until the first
   `loginWithGoogleCredential` call settles; the rendered GIS button is also visually dimmed and
   `pointer-events: none` during `signing-in`.
3. **`logout()` did not actually swallow a network failure.** `AuthProvider`'s `logout()` used
   `try { await logoutRequest() } finally { setState(...) }` — since a `finally` block does not
   suppress a thrown error, a failed `POST /api/auth/logout` (server unavailable) re-threw after
   setting state, becoming an unhandled promise rejection instead of the documented "always resolve
   to unauthenticated" behavior. Fixed by adding an intentional empty `catch` before the `finally`.

**New logout control (explicit owner change request — a small, non-material dashboard-shell
addition):** the previously non-functional "profile menu" button in `DashboardShell`'s header
(`src/components/dashboard/dashboard-shell.tsx`) now calls `useAuth().logout()`, disables itself
and shows "Signing out…" while in flight, and navigates to `/login` in every outcome (its
`ChevronDown` icon was replaced with `LogOut`; nothing else in the header, sidebar, or layout
changed). This is the only pixel-level change to a previously frozen dashboard file in all of
MVP-1, and it is confined to swapping one icon and wiring one existing, already-styled button —
layout, colors, spacing, and navigation hierarchy are unchanged, and Playwright's frozen-dashboard
overflow regressions (§ below) still pass unmodified.

The nonce lifecycle itself was reviewed and found already correct: `POST /api/auth/nonce` is
called before GIS initialization; the returned nonce is passed into `accountsId.initialize({
nonce, ... })`; GIS embeds that nonce as a signed claim inside the ID token it issues, so there is
no separate "nonce proof" field for the frontend to send — the BFF's `google-verifier.ts` extracts
and validates that claim against the stored nonce hash server-side. No nonce or ID token is ever
written to `localStorage`/`sessionStorage` (confirmed by a repo-wide grep finding zero references,
and by a dedicated test).

### Outcome

Makes the existing, already-approved auth backend (Phase 03C1, five `/api/auth/*` routes) usable
from the browser: a GIS login screen, a browser auth provider backed only by
`GET /api/auth/me`, and role-based route guards. No CRUD, uploads, reports, live Google login, or
production access. The frozen dashboards are visually unchanged; only real auth gating was added
in front of them.

### Files changed

| File | Change |
| --- | --- |
| `src/config/env.ts` (+ test) | Added `googleClientId` from `VITE_GOOGLE_CLIENT_ID` (already declared in `.env.example`, previously unread). Undefined when unset; never throws. |
| `src/auth/types.ts` (new) | `AuthUser`, `AuthSession`, `AuthErrorCode` (mirrors the BFF's safe codes plus a frontend-only `NETWORK_ERROR`), and the discriminated `AuthState` (`checking` / `unauthenticated` / `authenticated` / `error`). |
| `src/auth/role-mapping.ts` (+ test) | Maps the BFF's capitalized role string (`Admin`/`Agent`/`Processor`, per `apps-script/core/auth-domain.ts`'s `supportedRole`) to the frontend's lowercase `Role` type. Uses `Object.hasOwn` so an unrecognized value (including `"__proto__"`) never resolves to an inherited object instead of `undefined`. |
| `src/auth/api-client.ts` (+ test) | Thin, typed wrappers for all five `/api/auth/*` routes. Every request uses `credentials: "same-origin"`; `logout()` reads the current `__Host-hotech_csrf` cookie value (not `HttpOnly`, per `server/auth/cookies.ts`) and sends it as `X-CSRF-Token`, matching the BFF's double-submit check. Any error envelope is mapped to a known `AuthErrorCode` only — an unrecognized code from the server becomes `INTERNAL_ERROR` rather than being passed through raw. |
| `src/auth/auth-context.tsx` (+ test) | `AuthProvider`/`useAuth`. Calls `GET /api/auth/me` once on mount; `AUTH_REQUIRED`/`SESSION_EXPIRED` become `unauthenticated`, every other error code becomes a distinct `error` state (so `ACCOUNT_INACTIVE`/`ACCOUNT_LOCKED` are never silently treated as "just sign in again"). `logout()` always ends in `unauthenticated` locally, since the BFF's logout is itself safe/idempotent. |
| `src/auth/protected-route.tsx` (+ test) | Route guard. Renders the loading/error view while `checking`/`error`; redirects to `/login` (preserving the attempted path) while `unauthenticated`; redirects a signed-in wrong-role visitor to their own canonical dashboard via `routeForRole`; only then renders the guarded children. Role authorization is decided exclusively from `AuthProvider`'s state, itself sourced only from `GET /api/auth/me`. |
| `src/auth/auth-state-view.tsx` (new) | Shared loading/error view reusing the frozen `DashboardCard` styling. Generic copy only: never discloses whether an email/user row exists; `ACCOUNT_INACTIVE`/`ACCOUNT_LOCKED` both render "contact your Admin" with no other detail. |
| `src/auth/google-identity-services.ts` (new) | Loads the Google Identity Services script (`accounts.google.com/gsi/client`) at most once, only ever from the login page. |
| `src/pages/login-page.tsx` (+ test) | GIS login screen. Fetches a nonce (`POST /api/auth/nonce`) and initializes GIS with it; the only input to the app is the ID token GIS itself returns in its callback — no password/OTP field exists. Renders loading/unavailable/signing-in/error states with fixed generic copy; redirects to the canonical role dashboard (or the originally attempted path) once authenticated. |
| `src/app.tsx` | Wrapped routes in `AuthProvider`; added `/login`; each dashboard route is now wrapped in `ProtectedRoute` for its role. `DashboardPage`/all dashboard components (other than the header logout wiring below) are otherwise untouched. |
| `src/app.test.tsx` | Updated to mock `GET /api/auth/me` (the app no longer renders a dashboard without it); added a redirect-to-`/login` case and a wrong-role-redirect case. |
| `src/test/setup.ts` | Added a global `afterEach(cleanup)` from `@testing-library/react` — required once more than one `render()` call appears across a test file's cases; no prior test file needed it. |
| `e2e/dashboard-responsive.spec.ts` | Added a `page.route("**/api/auth/me", …)` stub simulating an authenticated session per role, since `npm run dev` has no live BFF backing it in this harness. Stubs only the one network response the guard reads; does not touch, weaken, or bypass any real auth code. Added one new regression: an unauthenticated visitor is redirected to `/login`. |
| `src/routes/constants.ts` (+ test) | Added `safeDestinationForRole()`: the only function permitted to decide a post-login redirect destination. Allowlists exactly the three canonical dashboard paths and requires the destination to match the caller's own role. |
| `src/auth/protected-route.tsx` | Now stores only its own canonical path (via `safeDestinationForRole`) as the attempted destination, never raw `location.pathname`. |
| `src/pages/login-page.tsx` | Post-login redirect now goes through `safeDestinationForRole`; added an in-flight guard against a concurrent/repeated GIS credential callback; the GIS button area is visually disabled during `signing-in`. |
| `src/auth/auth-context.tsx` | Fixed `logout()` to genuinely swallow a failed `POST /api/auth/logout` (was previously re-thrown past the `finally`, causing an unhandled rejection) so it always resolves to `unauthenticated`, matching its documented contract. |
| `src/components/dashboard/dashboard-shell.tsx` (+ test) | **Owner-approved minimal logout control.** The previously non-functional profile-menu header button now calls `useAuth().logout()`, disables itself and reads "Signing out…" while in flight, and navigates to `/login` in every outcome. Its `ChevronDown` icon is replaced with `LogOut`; nothing else in the header/sidebar/layout changed. |
| `src/pages/login-page-unavailable.test.tsx` (new) | Split out of `login-page.test.tsx` so the "no Google Client ID configured" case runs against the real (unmocked) `environment`, once the main file started mocking `googleClientId` for the new GIS-flow tests. |

Frozen and unchanged: `dashboard-ui.tsx`, `dashboard-page.tsx`, `chart-styles.ts`,
`src/data/dashboard-mocks.ts`, all Apps Script/server Phase 03A/03B/03C1/03C1A code.
`dashboard-shell.tsx` received only the owner-approved logout wiring described above; its layout,
colors, navigation hierarchy, and responsive behavior are otherwise unchanged (confirmed by the
unmodified Playwright overflow regressions).

### Route and auth flow

1. `/login` — unauthenticated visitor: `AuthProvider` calls `GET /api/auth/me`, sees
   `AUTH_REQUIRED`, sets `unauthenticated`. `LoginPage` fetches a nonce and initializes GIS;
   clicking the GIS-rendered button completes Google's own sign-in UI, which invokes the page's
   callback with an ID token only. That token is sent verbatim to `POST /api/auth/login`;
   the BFF (unchanged) verifies it, calls the frozen Apps Script `login_first_bind` operation
   through the Phase 03C1A ingress, and sets the session/CSRF cookies. The frontend then calls
   `refresh()` (`GET /api/auth/me` again) to obtain the authoritative role and redirects to that
   role's canonical dashboard, or to the path the visitor originally tried to reach.
2. `/admin|/agent|/processor/dashboard` — each wrapped in `ProtectedRoute` for its role.
   `checking` renders a loading view; `unauthenticated` redirects to `/login`; `error` renders the
   safe error view; a mismatched role redirects to the visitor's own canonical dashboard; only a
   matching role renders `DashboardPage` unchanged.
3. Logout — now wired to the dashboard header's sign-out control — calls `POST /api/auth/logout`
   with the CSRF cookie's current value as `X-CSRF-Token`, then sets local state to
   `unauthenticated` regardless of the network outcome (including a failed/unavailable request),
   and navigates to `/login`, matching the BFF's own safe/idempotent logout contract.

### Security boundaries preserved

- **No password/OTP/credential field exists in this app.** The only credential ever handled is the
  GIS-issued ID token, handed directly to the existing `POST /api/auth/login` route.
- **Role is never a client claim.** `roleFromServerValue` only accepts the BFF's own capitalized
  role string, itself sourced from the frozen Apps Script Sheet-backed check; an unrecognized
  value is rejected (`FORBIDDEN`), never guessed. Route authorization reads only from
  `AuthProvider`'s state, which itself reads only from `GET /api/auth/me`.
- **CSRF double-submit is honored, not reimplemented.** The frontend reads the same cookie value
  the BFF's `verifyCsrfDoubleSubmit` check expects and echoes it back as `X-CSRF-Token`; it never
  invents or bypasses this check.
- **Cookies remain the same-origin, `credentials: "same-origin"` fetch model** the BFF plan
  requires; no token is read from or written to any JS-readable storage (`localStorage`,
  `sessionStorage`) at any point — confirmed by a repo-wide grep and by a dedicated test.
- **No error message ever discloses account existence.** `ACCOUNT_INACTIVE`/`ACCOUNT_LOCKED` and
  every other error code render fixed generic copy only, per `docs/PHASE_03C_AUTH_PLAN.md`'s
  "never disclose whether an email or user row exists" rule.
- **Post-login destination is never attacker- or query-controlled.** `safeDestinationForRole`
  allowlists exactly the three canonical dashboard paths and requires a role match; there is no
  arbitrary return URL, no `?next=`/query-controlled redirect, and no external URL is ever honored.
- **A login attempt cannot be duplicated client-side.** An in-flight guard in `LoginPage` ignores a
  second GIS credential callback while the first is still being processed.
- **Logout is safe under server failure.** `logout()` swallows a failed `POST /api/auth/logout` and
  always resolves the frontend to `unauthenticated`; the dashboard header's sign-out control
  disables itself while in flight and always navigates to `/login` afterward, matching the BFF's
  own idempotent contract. It exposes no session or CSRF value in the DOM (verified by test).
- **No production, live Google, or live Apps Script/Vercel access occurred.** All tests use a
  mocked `fetch`/Playwright route stub.

### Test results (local; no live external resource used)

- `npm run test`: **240/240 passing** (was 220 before this review; +20 new: `routes/constants` (+5
  `safeDestinationForRole` cases), `login-page` (+4: nonce→GIS→login binding, concurrent-login
  prevention, nonce failure, no browser-storage), `login-page-unavailable` (split out, 1 test),
  `auth-context` (+3: `RATE_LIMITED` state, logout success, logout-under-failure),
  `protected-route` (+3: `RATE_LIMITED`/`INTERNAL_ERROR`/`AUTH_SERVICE_UNAVAILABLE` views),
  `dashboard-shell` (new, 5: nav preserved, logout success, logout failure, in-flight double-click
  prevention, no session/CSRF leakage in the DOM)).
- `npm run gas:test`: **57/57 Apps Script tests passing**, unaffected (no Apps Script/server file
  touched by this review).
- `npm run format:check`, `npm run typecheck`: clean.
- `npm run lint`: clean except the same one pre-existing-pattern warning
  (`react-refresh/only-export-components` on `auth-context.tsx`); lint exits 0.
- `npm run build`: production build succeeds; `dist/assets/*.js` scanned clean of every
  server-only secret/env-name substring (cookie *name* constants like `__Host-hotech_csrf`
  legitimately appear in the client bundle — the frontend must read them — but no pepper, HMAC key,
  Upstash token, or internal URL does).
- `npx playwright test`: **19/19 passing**, unchanged from the prior batch (confirms the logout
  wiring did not alter the frozen dashboard visual baseline).
- `git diff --check`: no whitespace/conflict-marker issues.
- No push, deploy, commit, or live Google/Upstash/Apps Script/Vercel access occurred at any point.

### Known limitations

- Real Google Identity Services and real Google sign-in are still untested here
  (`environment.googleClientId` is unset in every local/CI environment); the nonce→GIS→login
  binding is verified against a fake `accounts.id` that captures and replays the callback, not a
  real Google-issued token. Real GIS login remains an MVP-4 exercise on a Vercel Preview with a
  non-production Google OAuth Web Client.
- `RATE_LIMITED` and `REPLAY_OR_CONFLICT` render the same generic "please try again"/rate-limited
  copy as specified; no distinct backoff/countdown UI was added beyond what
  `docs/PHASE_03C_AUTH_PLAN.md` specifies as safe generic copy.
- The dashboard header's sign-out control has no confirmation dialog; logout is treated as a safe,
  reversible-enough action (the user simply signs back in), consistent with the BFF's own
  idempotent/no-confirmation logout design.
- CRUD, uploads, reports, and dashboard live-data wiring remain out of scope (MVP-2/MVP-3).

### Manual review routes

To review this locally: `npm run dev`, then visit `/admin/dashboard` (or `/agent`, `/processor`) —
expect a redirect to `/login`, since there is no live BFF session in local dev. `/login` itself
renders fully (heading, description, "Preparing sign-in…" or "Sign-in is temporarily unavailable"
depending on whether `VITE_GOOGLE_CLIENT_ID` is set) without needing any backend. Full login →
dashboard → guard → logout behavior, the safe-destination allowlist, concurrent-login prevention,
and every account/session error state are exercised in the automated test suite
(`src/auth/*.test.ts(x)`, `src/app.test.tsx`, `src/pages/login-page*.test.tsx`,
`src/components/dashboard/dashboard-shell.test.tsx`) and in the Playwright regressions
(`e2e/dashboard-responsive.spec.ts`) via mocked network responses, since a real session requires a
live Vercel Preview + Apps Script deployment (MVP-4).

---

# Preserved record — Phase 03C1A: Apps Script Internal Auth Ingress

Previous phase: **Phase 03C1 Vercel BFF Authentication Backend — Owner Approved and frozen
(2026-09-15), limited to its approved local/mocked implementation scope.**

Status: **Implemented locally. Ready for Owner Review.** Isolated non-production Web App
acceptance (`docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md`) now has a repository-owned automated runner
(`npm run acceptance:phase-03c1a`) but has still **not been executed** against a live deployment;
that execution is now deferred to MVP-4.

## Acceptance-tooling remediation (this update)

Before isolated acceptance is executed, the acceptance tooling itself was remediated: added a
repository-owned automated live-acceptance runner (`server/acceptance/`,
`scripts/run-phase-03c1a-acceptance.mjs`, `scripts/phase-03c1a-cli-entry.ts`) that automates all
twelve cases from `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md` §3 plus an explicit thirteenth
`charset=utf-8` case, against a single explicitly configured isolated URL, reusing the existing
`server/auth/signing.ts` canonical signing implementation unchanged. This is tooling only — no
acceptance was executed, nothing was deployed, and no approval state changed.

## Outcome

Added exactly one new Apps Script Web App route, `POST /v1/internal/auth`, dispatching an
explicit four-operation allowlist (`login_first_bind`, `validate_session`, `issue_csrf`, `logout`)
unchanged into the frozen Phase 03B domain (`executeInternalAuthPhase03B` → `executeInternalAuth`).
Fixed the BFF's Apps Script response-handling gap and added a 12-second request timeout with no
retry. No frontend work, no live deployment, no dashboard change.

## Changed

| File | Change |
| --- | --- |
| `apps-script/core/auth-ingress.ts` (new) | Ingress-only validation: `postData` presence, JSON media type (optionally `charset=utf-8`), 16 KiB UTF-8 byte-length cap, JSON parse, exact outer keys (`operation`, `envelope`), and the operation allowlist — all before calling the injected `executeInternalAuth`. Classifies thrown errors into `AUTH_DENIED`/`CONFLICT`/`INTERNAL_ERROR`; never logs the body, envelope, or a raw error. |
| `apps-script/core/api.ts` | `handlePost` now takes an optional `internalAuth` dependency and routes `/v1/internal/auth` to `handleInternalAuthRequest`; every other path keeps the frozen `NOT_FOUND` behavior. |
| `apps-script/core/contracts.ts`, `apps-script/core/response.ts` | Added the `AUTH_DENIED` `ErrorCode` (and its safe message) for this route only; the frozen `VALIDATION_ERROR`/`CONFLICT`/`INTERNAL_ERROR`/etc. codes and messages are unchanged. |
| `apps-script/Code.ts` | `doPost` wires the `internalAuth` dependency to the existing, unmodified `executeInternalAuthPhase03B`. `doGet`/health and every editor-only function are unchanged. |
| `server/auth/apps-script-client.ts` | Added a 12-second `AbortController` timeout (network failure and timeout both map to `AppsScriptUnavailableError`, no retry). Response handling now reads `body.error.code` (`AUTH_DENIED` → denial; `CONFLICT`/`INTERNAL_ERROR`/anything else on an `ok:false` HTTP-200 body, or a malformed/non-JSON `ok:true` body → unavailable) instead of collapsing every non-`ok:true` HTTP-200 body into one error type. |
| `scripts/check-apps-script-artifact.mjs` | Updated to allow `doPost` to route to `executeInternalAuthPhase03B` and reference `/v1/internal/auth`, while still failing if `doPost` calls any editor-only function, references `rotate_session`/`revoke_session`, or performs dynamic/caller-keyed dispatch; `doGet` remains checked as never routing to internal auth. Fixed a matching bug in `globalFunctionBody` (it previously matched only zero-or-one-character parameter names, so it inspected the esbuild footer's one-line delegator instead of the real bundled function body). |
| `apps-script/test/phase-03c1a-ingress.test.ts` (new) | 24 tests covering §G below. |
| `apps-script/test/foundation.test.ts` | Reworded/extended the existing "NOT_FOUND for all POSTs" test to also confirm `/v1/internal/auth` still falls to `NOT_FOUND` when the route is not wired (no behavior change to the assertion that existed). |
| `server/test/apps-script-client.test.ts` | Updated the one test whose expectation changed under the new mapping, and added 5 new tests for the `AUTH_DENIED`/`CONFLICT`/`INTERNAL_ERROR`/unrecognized-code cases and the 12-second timeout. |
| `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md` (new, then updated) | Prepared-only isolated Web App acceptance procedure per §H below; not executed. Updated with §3a documenting the automated runner. |
| `server/acceptance/env.ts` (new) | Dedicated, fail-closed environment loader for the acceptance runner only (distinct from `server/auth/env.ts`): requires an exact non-production confirmation literal, an HTTPS URL ending exactly with `/exec/v1/internal/auth`, rejects production/live-looking URLs or audiences, and validates the HMAC key/secret/test-user shape. Reads only from environment variables. |
| `server/acceptance/phase-03c1a-runner.ts` (new) | Pure, dependency-injected runner: builds all 12 runbook cases plus the explicit charset case using the existing `createInternalEnvelope`/`signingInput` from `server/auth/signing.ts` (no duplicated HMAC logic), scans every raw response for prohibited content (secrets used in the run, stack traces, Sheet IDs, raw signature/JTI/session/CSRF fields, any email address) before recording a check, and returns only a sanitized `{ suite, ok, passed, failed, checks: [{ name, ok, safeCode }] }` summary. |
| `scripts/run-phase-03c1a-acceptance.mjs` (new) | CLI entrypoint: esbuild-bundles the TS runner (same pattern as `scripts/build-apps-script.mjs`) and executes it, printing only the sanitized summary or a config-error message. Added as `npm run acceptance:phase-03c1a`; never invoked by `test`/`build`/`lint`/`gas:test`. |
| `scripts/phase-03c1a-cli-entry.ts` (new) | Thin printing shell wiring `loadAcceptanceConfig` to `runPhase03C1AAcceptance`. |
| `server/test/phase-03c1a-acceptance-env.test.ts`, `server/test/phase-03c1a-runner.test.ts` (new) | 17 mocked tests: production-looking URL/audience rejection, wrong URL suffix, missing/wrong confirmation literal, malformed secret shape, missing required config, sanitized summary shape, correct safe-code mapping for every case, explicit charset-acceptance case, and three leakage-detection cases (echoed secret, raw stack trace, embedded email address). |
| `tsconfig.server.json`, `eslint.config.js` | Extended to include/lint `scripts/*.ts` with Node globals, so the new CLI entry file is typechecked and linted like the rest of the server code. |
| `package.json` | Added the `acceptance:phase-03c1a` script only; no existing script changed. |

Frozen and unchanged: `apps-script/core/auth-domain.ts`, `auth-envelope.ts`, `auth-crypto.ts`,
`auth-config.ts`, `session-lifecycle.ts`, `first-bind.ts`, `sheet-auth-store.ts`, all dashboard
components/routes/layouts, `docs/PHASE_03B_ACCEPTANCE_RUNBOOK.md`.

## Ingress and allowlist behavior

- HTTP path: `POST /v1/internal/auth` (`e.pathInfo` normalized via the existing `parsePathInfo`).
  Any other POST path returns the frozen safe `NOT_FOUND` envelope.
- Outer request contract: exactly `{ operation, envelope }`, nothing more or less.
- Allowlist is a literal array membership check (`ALLOWED_OPERATIONS`), not a dynamic/caller-keyed
  lookup: `login_first_bind`, `validate_session`, `issue_csrf`, `logout`. Anything else (including
  `rotate_session`, `revoke_session`, and every editor-only function name) is rejected with
  `AUTH_DENIED` before the envelope is even shape-checked, and before any dispatch occurs.
- Validation order matches §C of the original plan: path → `postData` presence → media type
  (`application/json`, optional `charset=utf-8`) → UTF-8 byte size (≤16 KiB, measured manually
  since Apps Script has no `Buffer`/`TextEncoder` guarantee) → JSON parse → exact outer keys →
  operation allowlist → envelope shape → dispatch into the frozen `executeInternalAuth`.
- The frozen HMAC/session/replay logic in `verifyEnvelope`/`executeInternalAuth` is untouched; this
  ingress performs no signature or domain logic of its own.
- Response codes for this route: `AUTH_DENIED` (validation/signature/time/replay/unsupported-op/
  authorization denial), `CONFLICT` (lock contention), `INTERNAL_ERROR` (configuration/storage/
  unexpected failure). No caught error's message, stack trace, configuration, or internal ID is
  ever returned.

## BFF client fixes

- `server/auth/apps-script-client.ts` now attaches a 12-second `AbortController` timeout to the
  Apps Script `fetch` call; a timeout and a network failure both map to `AppsScriptUnavailableError`
  with no automatic retry.
- HTTP 200 + `ok:true` (with an object `data`) → success. HTTP 200 + `ok:false` with
  `error.code === "AUTH_DENIED"` → `AppsScriptDeniedError`. HTTP 200 + `ok:false` with `CONFLICT`,
  `INTERNAL_ERROR`, an unrecognized code, or a malformed/non-JSON body → `AppsScriptUnavailableError`.
  Google-edge non-200 (408/429/5xx) → `AppsScriptUnavailableError`; other non-200 → `AppsScriptDeniedError`
  (unchanged from Phase 03C1).
- `Cache-Control: no-store` on browser-facing responses is unaffected (not touched by this phase).

## Test counts and results (local; no live external resource used)

- `npm run test`: **189/189 passing** (was 172 before this update; +17 new: 9 acceptance-env
  config tests, 8 acceptance-runner tests with a mocked fetcher).
- `npm run gas:test` (`test:apps-script` + `gas:build` + `gas:check`): **57/57 Apps Script tests
  passing** (unchanged by this update), generated-artifact checks passing.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: all clean.
- `npm run build`: production build succeeds; `dist/assets/*.js` scanned clean of server-only
  secret/env-name substrings (`INTERNAL_HMAC`, `SESSION_TOKEN_PEPPER`, `CSRF_TOKEN_PEPPER`,
  `UPSTASH_REDIS`, `RATE_LIMIT_KEY_SECRET`, `APPS_SCRIPT_INTERNAL_URL`, `PHASE_03C1A_HMAC_SECRET`,
  `PHASE_03C1A_TARGET_URL`).
- `npx playwright test`: all **18** frozen-dashboard regressions passing.
- Credential scan (`AIza…`, PEM headers, `client_secret`) over the diff: no matches.
- `git diff --check`: no whitespace/conflict-marker issues.
- No push, deploy, live Google/Upstash/Apps Script/Vercel access, or live acceptance execution
  occurred at any point.

## Known limitations

- The isolated, non-production Apps Script Web App acceptance in
  `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md` has **still not been executed** against a live
  deployment — this update remediated the tooling only. This phase cannot move to Owner Approved
  until that acceptance is actually run and passes.
- The automated runner's "wrong HTTP method" check only proves no leakage occurred on a GET; it
  does not assert the exact frozen `doGet` health/not-found body shape. The runbook's
  result-recording template requires a manual confirmation of this case in addition to the
  runner's automated pass/fail.
- The runner's §4 optional BFF-side spot check (`/api/auth/login`, `/csrf`, `/logout` against a
  live Vercel Preview) is not automated by this tooling and remains manual/optional.
- The production-looking-URL/audience guard in `server/acceptance/env.ts` is a text-pattern
  heuristic (`prod`, `production`, `live`) and cannot itself know whether a URL is truly
  production; the mandatory `PHASE_03C1A_CONFIRM_NON_PRODUCTION` literal is the operator's actual
  attestation, not a substitute for care in choosing the target URL.
- This phase does not implement the GIS login screen, browser auth provider/state, dashboard route
  guards, Phase 03C2/03D work, application CRUD/uploads/reports, or any production deployment.
- The BFF's `apps-script-client.ts` change is scoped to timeout and response-code mapping only; no
  other Phase 03C1 route/cookie/CSRF/rate-limit behavior was touched.

## Isolated Apps Script acceptance procedure

See `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md` in full, including its new §3a. Summary: deploy the
built `Code.js` to a fresh, isolated, non-production Sheet/Apps Script Web App with independently
generated secrets and the minimum access mode the BFF requires (documenting the "Anyone" access
exposure and its signature-only mitigation if required), seed the one required `Users` row, then
run `npm run acceptance:phase-03c1a` with the documented environment variables to automatically
exercise all twelve planned cases plus the charset case against the deployed URL, review the
printed sanitized summary, manually confirm the wrong-method case's exact response shape, and
complete the result-recording template before revoking the deployment.

## Approval state

**Ready for Owner Review.** Not Owner Approved. Not FINAL. Its live isolated acceptance is deferred
into MVP-4 per `docs/MVP_COMPLETION_PLAN.md`; this phase stays Ready for Owner Review until that QA
passes. Old Phase 03C2 is superseded by MVP-1 and old Phase 03D by MVP-4.

---

## Overall approval state (top of file)

- **MVP-1 — Authentication Frontend: Owner Approved and frozen (2026-09-16).** Committed locally
  (not pushed) as `feat(mvp-1): implement approved authentication frontend`. Future material
  login/dashboard-auth UI changes require an explicit owner change request.
- **Phase 03C1A: Ready for Owner Review** (unchanged; committed locally, not pushed). Live
  acceptance deferred to MVP-4.
- **MVP-2 — Core Tracker CRUD: fully implemented locally (checkpoint commits, not Owner
  Approved).** MVP-2D/2E folded into MVP-2C (D-043); MVP-2F verified existing coverage and closed
  one gap (D-044). Split into MVP-2A–2F (see above); full
  route/RBAC/transition/validation/concurrency/audit/pagination/error/test specification is
  recorded above. Committed locally (not pushed) as `feat(mvp-2a): implement plans crud foundation`,
  `feat(mvp-2b): implement user administration`, `feat(mvp-2c): implement applications crud
  foundation`, and `test(mvp-2f): verify core tracker workflows`.
- **MVP-3 — Dashboard Live Data: implemented locally (checkpoint commit, not Owner Approved,
  D-045).** Wires the frozen Admin/Agent/Processor dashboards to live `/api/applications`
  (and Admin-only `/api/users`) data via a new `useDashboardData` hook, with zero layout/palette/
  navigation change to any frozen dashboard file. See "MVP-3 result" below. Committed locally (not
  pushed) as `feat(mvp-3): connect approved dashboards to live data`.

## MVP-3 result (2026-09-16)

Implemented and locally verified as a checkpoint commit (not Owner Approved — see D-045). Read
`docs/UI_DASHBOARD_CONTRACT.md` and the existing frozen `src/components/dashboard/*` /
`src/pages/dashboard-page.tsx` files before making any change, per this batch's own instructions.
Summary:

- `src/types/application.ts` (new): the frontend's own `ApplicationStatus` union, matching the
  frozen Apps Script schema's `STATUS_VALUES` exactly.
- `src/data/applications-api.ts` (new): a typed BFF client mirroring `src/auth/api-client.ts`'s
  `request()` pattern — `credentials: "same-origin"`, safe error-code mapping, never trusting an
  unrecognized server error code. `fetchAllApplications`/`fetchAllUsers` page through
  `GET /api/applications`/`GET /api/users` via the existing cursor field, capped at 20 pages.
- `src/data/use-dashboard-data.ts` (new): `useDashboardData(role)` fetches applications (and, for
  Admin only, users, for quick-stat agent/processor counts — a failure there never blocks the
  applications data) and derives the exact `Metric[]`/`StatusBreakdown[]`/table-row shapes the
  frozen dashboard components already render. State transitions `loading` → `empty` (zero
  applications) or `populated`, or `error` on any fetch failure. Row-level scoping (Agent
  own-applications-only, Processor assigned-only) is enforced authoritatively by Apps Script from
  the session; this hook never re-filters or trusts a client-side identity for authorization.
- `src/pages/dashboard-page.tsx`: `AdminDashboard`/`AgentDashboard`/`ProcessorDashboard` now accept
  the live `DashboardDataResult` as a prop instead of importing static mocks for metrics, status
  breakdown, and table rows. The `?state=` query param (used by Playwright/manual QA) still wins
  over the live-derived state when present, preserving the existing `resolveDashboardState`
  mechanism unchanged; otherwise the state comes from the live fetch. No layout, card order,
  navigation, or palette was touched — every existing dashboard UI component
  (`MetricCard`/`StatusDonut`/`StatusBadge`/tables/etc.) is reused unchanged.
- **Known limitation, explicitly accepted for this batch:** the Admin "Monthly Applications" trend
  chart is now derived live (grouped by submission month), but the Agent's multi-status
  "My Applications" trend and the Processor's daily productivity bar chart remain on illustrative
  fixture data, because both require server-side time-series aggregation the API does not yet
  expose. This is documented, not silently mocked in the shipped path — a future endpoint can
  replace it without further UI change.
- `e2e/dashboard-responsive.spec.ts`: added a `mockDashboardData()` route stub for
  `/api/applications`/`/api/plans`/`/api/users` (small fixed dataset), applied alongside the
  existing `/api/auth/me` stub, since the dashboard now makes real fetch calls the harness has no
  live backend for. This updates the stub to match the real request shape the app now makes — it
  does not loosen any assertion.
- `src/app.test.tsx`: the two tests that render an authenticated dashboard now route their mocked
  `fetch` by URL (`fetchRouter`) instead of returning one flat `/api/auth/me`-shaped response for
  every call, since the dashboard now also calls `/api/applications`.
- `src/data/use-dashboard-data.test.ts` (new): 7 tests covering the loading → populated/empty/error
  transitions, pagination via `nextCursor`, and Admin-only agent/processor quick-stat counts.

**Verification (local; no live external resource used):** 398/398 total unit tests (was 391, +7 new
`useDashboardData` tests), `npm run format`/`format:check`, `npm run lint` (0 errors, same one
pre-existing warning), `npm run typecheck`, `npm run gas:build`/`gas:check`/`npm run gas:test`
(unaffected — no Apps Script/server file was touched), `npm run build` (production bundle scanned
clean of secrets), `npx playwright test` (19/19 passing, after adding the three route stubs above),
a credential/secret grep over the diff (clean), and `git diff --check` (clean, only benign
CRLF-conversion warnings). Committed locally (not pushed) as
`feat(mvp-3): connect approved dashboards to live data`.

**Known limitations:** local/mocked only — no live Apps Script deployment, live Google/Upstash, or
Vercel Preview was used; that remains MVP-4. No write/mutation UI (create/edit application forms,
Processor transition actions, Admin assignment UI) was added — MVP-3 is read-only dashboard data
per its scope; that interactive surface remains future work beyond the five-batch MVP roadmap's
explicit scope.

### MVP-3 fix (2026-09-16, D-047): live trend/productivity aggregates

The trend-chart illustrative-fixture limitation noted above is now resolved. Added
`applications_aggregate` to the `CrudOperation` union (`apps-script/core/contracts.ts`) and its
allowlist entry in `crud-ingress.ts` — reusing the existing `POST /v1/internal/crud` route, no new
entrypoint. `apps-script/core/dashboard-aggregate.ts` (new) builds a bounded, role-scoped,
zero-filled 14-UTC-day aggregate (`DashboardAggregateResult`) from `ApplicationsRepository.list()`
(already role-filtered upstream in `crud-domain.ts`'s new `getApplicationsAggregate` handler,
mirroring `listApplications`'s scoping exactly: Admin sees all, Agent forced to their own
`agentId`, Processor forced to their own `processorId`) and a direct read of the frozen
`Status_History` sheet for status-change-per-day counts. UTC calendar-day bucketing was adopted as
an explicit new decision (D-047) since no prior timezone convention existed anywhere in this
codebase. No raw customer/contact field is ever included in the response.

BFF: `GET /api/applications/aggregate` (`handleGetApplicationsAggregateRoute` in
`server/crud/routes/applications.ts`, `api/applications/aggregate.ts`), mirroring the existing
route pattern exactly (session-cookie auth, `applications-read` rate-limit bucket, unchanged
`BffResponse<T>`/`BffErrorCode`). Frontend: `fetchDashboardAggregate()`
(`src/data/applications-api.ts`) and `useDashboardData`'s new `trend`/`productivity` fields
(`src/data/use-dashboard-data.ts`) feed `dashboard-page.tsx`'s Agent trend chart and Processor
productivity chart directly, replacing the `agentTrend`/`processorProductivity` imports from
`dashboard-mocks.ts` (both fixtures were deleted from that file — no other fixture or chart was
touched). A failed aggregate fetch is supplementary and never blocks the rest of the dashboard;
it renders an empty (never null/undefined) series instead.

**Verification:** 156/156 Apps Script tests (+16), 423/423 total unit tests (+25), `format`/
`format:check`/`lint`/`typecheck` clean, `gas:build`/`gas:check` passing (no new route), `build`
scanned clean of secrets, 19/19 Playwright regressions (one new `/api/applications/aggregate`
stub added to `e2e/dashboard-responsive.spec.ts`), a credential/secret grep over the diff and new
files (clean), and `git diff --check` (clean, only benign CRLF-conversion warnings). `git diff
--stat` confirmed only the expected 13 modified + 3 new files changed — no other dashboard visual/
layout file was touched. No live external resource was used. Committed locally (not pushed) as
`fix(mvp-3): replace dashboard trend fixtures with live aggregates`. See D-047.

### MVP-4 local tooling result (2026-09-16, D-048)

**Local preparation only — no live Google/Vercel/Upstash/Apps Script resource was accessed, no
secret was generated or requested, and nothing was deployed.** Extends the existing, unchanged
Phase 03C1A acceptance tooling (`server/acceptance/env.ts`, `phase-03c1a-runner.ts`,
`scripts/run-phase-03c1a-acceptance.mjs`/`phase-03c1a-cli-entry.ts`, `npm run
acceptance:phase-03c1a`) with a sibling runner covering the parts of MVP-4's scope the auth-only
runner does not reach:

- `server/acceptance/mvp4-env.ts`: fail-closed loader for `MVP4_AUTH_TARGET_URL` (must end
  `/exec/v1/internal/auth`) and `MVP4_CRUD_TARGET_URL` (must end `/exec/v1/internal/crud`),
  `MVP4_CONFIRM_NON_PRODUCTION` (exact literal), `MVP4_INTERNAL_AUDIENCE`, `MVP4_HMAC_KEY_ID`/
  `MVP4_HMAC_SECRET`, `MVP4_TEST_ADMIN_EMAIL`/`MVP4_TEST_ADMIN_SUBJECT` — the exact same
  non-production-confirmation/URL-suffix/production-looking-value-rejection pattern as
  `server/acceptance/env.ts`, not a duplicate implementation with different (weaker) rules.
- `server/acceptance/mvp4-runner.ts`: session lifecycle (`login_first_bind` →
  `validate_session`), CRUD ingress RBAC (`plans_list` as Admin), CSRF (`plans_create` without
  `csrf_token` expects `AUTH_DENIED`; with it, succeeds), a version/`expected_updated_at` conflict
  case (`plans_update` with a deliberately stale token expects `CONFLICT`), a non-existent-target
  case (expects a safe `NOT_FOUND`/`FORBIDDEN`/`VALIDATION_ERROR`, never a raw Sheet error), an
  invalid-signature case (expects `AUTH_DENIED`), and a dashboard-data check
  (`applications_aggregate` returns a validly shaped, bounded aggregate — see D-047). Reuses
  `server/auth/signing.ts`'s `createInternalEnvelope` unchanged; duplicates no HMAC logic.
- `server/acceptance/mvp4-synthetic-data.ts`: pure builder/predicate functions for synthetic
  Plans/Applications rows, every field prefixed with the exact literal `__mvp4_test__`, mirroring
  Phase 03B's D-026 `__phase03b_test__` isolation pattern exactly. `isMvp4SyntheticApplication`/
  `isMvp4SyntheticPlan`/`selectMvp4SyntheticApplications`/`selectMvp4SyntheticPlans` use exact
  `startsWith` matching only — never a fuzzy/substring match — so a cleanup step built on them can
  never delete a real row. This module performs no network call and touches no real Sheet in this
  stage; it is tooling with tests, not something executed against a live resource.
- `scripts/run-mvp4-acceptance.mjs`/`scripts/mvp4-cli-entry.ts` and `npm run acceptance:mvp4`/
  `acceptance:mvp4:check`, esbuild-bundled exactly like the Phase 03C1A CLI entrypoint. Confirmed
  (`node scripts/run-mvp4-acceptance.mjs --check-only` with no `MVP4_*` variables set) that it
  fails closed with a clear config-missing message and attempts no network call when unconfigured.
- `docs/MVP4_ACCEPTANCE_RUNBOOK.md` (new): the full MVP-4 procedure — isolated resources needed
  (§1), exact env var names (never values), the local tooling's usage (§2), the manual steps this
  tooling does not automate (real GIS login, cookie/session-timeout observation, a full
  create/assign/transition/dashboard-refresh click-through, §3), teardown (§4), and a
  result-recording template — documentation only, not executed as part of this stage.

**Verification (local; no live external resource used):** 453/453 total unit tests (was 423, +30:
12 `mvp4-acceptance-env` config tests, 10 `mvp4-runner` tests with a mocked fetcher, 8
`mvp4-synthetic-data` predicate/builder tests), 156/156 Apps Script tests unchanged (no Apps
Script file was touched by this stage), `npm run format`/`format:check` clean, `npm run lint`
(0 errors, same one pre-existing warning), `npm run typecheck` clean, `npm run gas:build`/
`gas:check` passing unchanged, `npm run build` (production bundle scanned clean of the new
`MVP4_*` secret-name substrings), `npx playwright test` (19/19 unchanged), a credential/secret
grep over the new files (clean), and `git diff --check` (clean, only a benign CRLF-conversion
warning on `package.json`). No existing acceptance tooling's fail-closed guards were weakened.
Committed locally (not pushed) as `test(mvp-4): prepare isolated integration acceptance tooling`.
See D-048.

**Known limitations:** this stage is tooling/documentation only. No isolated Sheet, Apps Script
Web App deployment, Vercel Preview, Google OAuth Web Client, or Upstash instance was created. The
next step is external and owner-driven: see `docs/MVP4_ACCEPTANCE_RUNBOOK.md` §1 for the exact
resource checklist before `npm run acceptance:phase-03c1a` / `npm run acceptance:mvp4` can be run
against a live deployment.
