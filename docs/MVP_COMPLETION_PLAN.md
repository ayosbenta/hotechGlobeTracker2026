# MVP Completion Plan

Status: **Owner Approved (2026-09-15).** See decisions D-035/D-036 in `docs/DECISIONS.md`.

Owner change request (2026-09-15): consolidate the remaining roadmap into five MVP batches,
preserving every Owner Approved/frozen phase and the currently implemented Phase 03C1A work.

## 1. Why this plan exists

The original roadmap split the remaining work into many small phases (03C2, 03D, then unplanned
CRUD/dashboard/reporting phases). For a simple internal tracker that overhead costs more than it
buys. This plan reduces the remainder to five batches, each of which ends in something the owner
can actually look at and use.

It changes **scope sequencing only**. It does not relax any security control, delete any test, or
alter any frozen behavior.

## 2. Status table

| Item | State | Notes |
| --- | --- | --- |
| Phase 00 — Frontend foundation | **Owner Approved / frozen** (2026-09-13) | Untouched by this plan. |
| Phase 01 — Role dashboards | **Owner Approved / frozen** (2026-09-14) | Visual baseline preserved; MVP-3 swaps data only. |
| Phase 02 — Sheets/Apps Script foundation | **Owner Approved / frozen** (2026-09-14) | Schema, locks, versioning, status matrix, audit primitives reused as-is by MVP-2. |
| Phase 03A — Auth schema and security primitives | **Owner Approved / frozen** (2026-09-14) | Untouched. |
| Phase 03B — Auth/session domain | **Owner Approved / frozen** (2026-09-14) | Untouched; MVP-1 reaches it only through the frozen ingress. |
| Phase 03C1 — Vercel BFF auth backend | **Owner Approved / frozen** (2026-09-15) | All five `/api/auth/*` routes exist; MVP-1 consumes them. |
| Phase 03C1A — Apps Script internal auth ingress + acceptance tooling | **Ready for Owner Review** | Implemented and locally verified (189/189 tests). **Live acceptance deferred to MVP-4.** Stays Ready for Owner Review until MVP-4 passes. |
| Phase 03C1A manual isolated setup (in progress) | **Stopped** | The partially-started manual Sheet/Apps Script setup is discontinued. No resource created in that attempt is reused. |
| Phase 03C2 (old) — GIS login UI and guards | **Superseded** | Becomes **MVP-1**. |
| Phase 03D (old) — Isolated Vercel Preview QA | **Superseded** | Absorbed into **MVP-4**, now also covering 03C1A ingress acceptance, CRUD and dashboards. |
| MVP-1 — Authentication frontend | **Owner Approved / frozen** (2026-09-16) | Local/mocked scope only (D-037). 240/240 unit tests, 19/19 Playwright. Committed locally as `feat(mvp-1): ...`, not pushed. Future material login/dashboard-auth UI changes require an owner change request. |
| MVP-2 — Core tracker CRUD | **Planning only** (2026-09-16) | Split into MVP-2A–2F (D-038); full specification recorded in `docs/NEXT_TASK.md`. Not started. |
| MVP-3 — Dashboard live data | **Implemented locally (checkpoint commits, not Owner Approved).** | Data-source swap complete for all dashboard surfaces, including the two trend/productivity charts previously left on illustrative fixture data — resolved by D-047 (`applications_aggregate`). |
| MVP-4 — Final isolated integration QA | **Local tooling prepared (D-048); live execution not started.** | `npm run acceptance:mvp4` + `docs/MVP4_ACCEPTANCE_RUNBOOK.md` extend the Phase 03C1A acceptance pattern to the CRUD ingress, session lifecycle, and dashboard-data checks. No live isolated Sheet/Apps Script/Vercel resource has been created. Depends on MVP-1..3; unblocks 03C1A approval. |
| MVP-5 — Production release | **Not started** | Requires explicit owner approval to execute. |
| Uploads / Google Drive attachments | **Deferred post-MVP** | `Attachments` tab already exists in the frozen schema; unused for now. |
| Advanced reports | **Deferred post-MVP** | |
| Notifications | **Deferred post-MVP** | |
| Bulk import/export | **Deferred post-MVP** | |
| Advanced reconciliation UI | **Deferred post-MVP** | `reconcileAuthAuditPhase03B()` remains editor-only. |
| Nonessential admin customization | **Deferred post-MVP** | |

## 3. Reconciling the old roadmap

| Old item | Disposition |
| --- | --- |
| Phase 03C2 (GIS login UI, auth provider/state, route guards, role redirects, error states) | Carried over **whole** into MVP-1. No scope dropped. |
| Phase 03D (isolated Vercel Preview end-to-end security QA) | Carried into MVP-4 and **widened**: it now also absorbs the deferred Phase 03C1A live ingress acceptance, plus CRUD, status-workflow and dashboard regression testing, so the project performs **one** isolated integration QA instead of two. |
| Phase 03C1A live isolated acceptance (its own separate deployment + teardown) | **Deferred and merged into MVP-4.** Rationale: it required standing up a throwaway Sheet + Apps Script Web App, then tearing it down, only to stand up a near-identical isolated environment again for 03D. One environment, one teardown. |
| `docs/PHASE_03C_AUTH_PLAN.md` | Remains **Owner Approved and binding** for auth architecture. This plan re-sequences its batches; it does not override any of its security decisions. |
| `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md` | Remains the binding procedure, executed during MVP-4 rather than standalone. Its 13 automated cases and `npm run acceptance:phase-03c1a` runner are unchanged. |

## 4. The five MVP batches

### MVP-1 — Authentication Frontend

Makes the existing, already-built auth backend usable from the browser.

- GIS login screen (Google Identity Services, using the `POST /api/auth/nonce` → GIS → `POST /api/auth/login` flow already implemented).
- Browser auth provider/state; no token or session material held in JS-readable storage.
- Integration with all five existing `/api/auth/*` routes, including `GET /api/auth/csrf` and the `X-CSRF-Token` header on every mutating call.
- Canonical role redirects only: Admin → `/admin/dashboard`, Agent → `/agent/dashboard`, Processor → `/processor/dashboard`.
- Protected role routes; unauthenticated and wrong-role access fails closed to login.
- Safe loading / inactive / locked / expired / generic-error states using the frozen plan's generic copy (never disclosing whether an email or user row exists).
- **No dashboard redesign.** The frozen visual baseline is untouched.

Exit criteria: full local verification suite green; 18 Playwright dashboard regressions still pass; login flow exercised against mocked BFF routes (real Google login remains MVP-4).

### MVP-2 — Core Tracker CRUD

The actual tracker. Google Sheets stays the database; the frozen Phase 02 schema already has every
tab and column this needs. **Split into six bounded internal batches** (D-038) to keep this,
the largest remaining batch, reviewable:

- **MVP-2A** — shared contracts, Apps Script repository layer, Admin Plans CRUD.
- **MVP-2B** — Admin Users/role assignments and account-status management.
- **MVP-2C** — Applications create/read/update foundation.
- **MVP-2D** — Agent own-application workflow.
- **MVP-2E** — Processor queue/assignment/status transitions.
- **MVP-2F** — integration verification, audits, and regression across 2A–2E.

The full route/RBAC/status-transition/validation/concurrency/locking/audit/pagination/error/test
specification is recorded in `docs/NEXT_TASK.md` and is the binding reference for implementation;
this plan document tracks only the batch split and the constraints below.

- Admin: manage Users, Agents, Processors, Plans, Applications; assign Processor.
- Agent: create applications; view own applications only.
- Processor: view assigned/available applications; update allowed statuses only.
- **Server-enforced RBAC** in Apps Script — role comes from the Sheet-backed session, never from a client claim.
- Reuses the frozen Phase 02 primitives: UUIDs, `version` optimistic concurrency, `LockService` script locks, `Status_History` rows, `Activity_Logs` audit rows, and the frozen `validateTransition` status matrix (including notes-required and job-order-required rules).
- New internal Apps Script operations added behind the **same** frozen signed-envelope ingress pattern as auth — allowlisted explicitly, never dynamically dispatched.

Exit criteria (per batch, and overall at MVP-2F): full local verification suite green; new CRUD/RBAC
unit tests; no frozen module modified.

### MVP-3 — Dashboard Live Data and Workflow Completion

- Replace `src/data/dashboard-mocks.ts` values with authoritative data from MVP-2's endpoints.
- Admin overview; Agent performance/application data; Processor queue/status data.
- Loading, empty, and safe error states for every data surface.
- **Preserve the frozen visual baseline** — layout, hierarchy, palette, card density, charts, tables, spacing and role menus unchanged. Data swap only.

Exit criteria: 18 Playwright regressions still pass unchanged; full local suite green.

### MVP-4 — Final Isolated Integration QA

One isolated environment, one teardown — replacing both the deferred 03C1A acceptance and old 03D.

- One fresh isolated non-production Sheet + Apps Script project (not the Phase 03A/03B one, not the stopped 03C1A attempt).
- One Vercel Preview, with a distinct non-production Google OAuth Web Client.
- Phase 03C1A ingress acceptance via `npm run acceptance:phase-03c1a` (all 13 automated cases) plus the manual wrong-method confirmation.
- Real non-production GIS login end-to-end.
- Cookies, CSRF, session lifetime/idle/absolute limits, and role enforcement verified live.
- CRUD and status-workflow tests against the isolated Sheet.
- Dashboard regression tests against live data.
- Full cleanup and teardown: deployment revoked, isolated project/Sheet deleted, temporary secrets cleared.
- **No production deployment.**

Exit criteria: all of the above pass and are recorded via the runbook's result-recording template.
On success, Phase 03C1A and MVP-1..3 become eligible for Owner Approval together.

### MVP-5 — Production Release

Executed **only** after explicit owner approval, step by step.

- Production configuration checklist (all server-only env vars present and validated).
- Secret rotation: every secret used in any isolated/preview environment is rotated out; no exposed non-production value reaches production.
- Git integrity: review the full diff, credential scan, `git diff --check`.
- GitHub push.
- Vercel and Apps Script production deployment — each pausing for explicit owner confirmation.

## 5. Effort estimate (Claude Sonnet Medium)

Rough implementation sessions, excluding owner review time and any live QA the owner performs.

| Batch | Estimated sessions | Main drivers |
| --- | --- | --- |
| MVP-1 | 2–3 | GIS script loading, auth context/state, guards, error states, tests. |
| MVP-2 | 4–6 | Largest batch: ~5 entity surfaces × 3 roles, new Apps Script operations, RBAC, versioning/lock handling, substantial test coverage. |
| MVP-3 | 2–3 | Data wiring plus loading/empty/error states across three dashboards without visual drift. |
| MVP-4 | 1–2 (plus owner-driven live QA) | Mostly owner-executed; my share is test scaffolding, runbook updates and result recording. |
| MVP-5 | 1 (plus owner-gated deploy steps) | Checklist, rotation guidance, push/deploy pauses. |
| **Total** | **10–15 sessions** | MVP-2 is the dominant cost and the best candidate for further splitting if a session runs long. |

Estimates assume no material change to frozen phases and no new external dependency beyond those
already approved.

## 6. Constraints carried forward unchanged

- Owner approval is required before any phase is FINAL; I never self-approve.
- No production resource access, push, or deployment without an explicit owner instruction at that moment.
- Frozen dashboards and frozen Phase 03A/03B modules stay unchanged.
- Apps Script remains authoritative for identity, role, session and authorization; browser claims are never trusted.
- No secret, Sheet ID, deployment URL, token, signature or raw error is printed, logged, or committed.
