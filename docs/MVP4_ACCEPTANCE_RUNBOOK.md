# MVP-4 isolated integration acceptance

Status: **Prepared only. Not yet executed. Do not deploy from this document without separate owner instruction.**

This procedure is for ONE fresh, isolated, non-production Sheet + Apps Script
Web App project and ONE Vercel Preview, replacing both the deferred Phase
03C1A live acceptance and the old Phase 03D isolated QA (see D-036,
`docs/MVP_COMPLETION_PLAN.md`). Do not use production Sheet IDs, users,
secrets, or Google OAuth Web Client credentials, and never reuse a secret
generated for this procedure anywhere else — including a later MVP-5
production configuration.

This document describes the LOCAL tooling this repository now provides for
that procedure (`npm run acceptance:mvp4`, following the exact same
dependency-injected, fail-closed, sanitized-summary pattern as
`docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md`'s `npm run acceptance:phase-03c1a`)
plus the manual steps around it. **Preparing this tooling is not the same as
running it against a live resource** — no live acceptance has been executed
as part of preparing this document or its tooling.

## What this covers beyond Phase 03C1A's runner

`npm run acceptance:phase-03c1a` already automates the Phase 03C1A
auth-ingress-only acceptance (13 cases against `POST /v1/internal/auth`) and
remains the binding procedure for that surface, unchanged and reused here
exactly as-is (per `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md`).

`npm run acceptance:mvp4` is a **sibling** runner (`server/acceptance/
mvp4-runner.ts` + `mvp4-env.ts`, CLI entry `scripts/run-mvp4-acceptance.mjs`
+ `scripts/mvp4-cli-entry.ts`) that additionally exercises:

- The CRUD ingress (`POST /v1/internal/crud`): a session-scoped `plans_list`
  read, a `plans_create` mutation requiring CSRF (and a negative case
  proving a missing `csrf_token` is denied), an `applications_create`
  mutation, a deliberately stale `expected_updated_at` on `plans_update`
  (expects `CONFLICT`), an operation targeting a non-existent row (expects a
  safe `NOT_FOUND`/`FORBIDDEN`/`VALIDATION_ERROR`, never a raw Sheet error),
  and an invalid-signature case (expects `AUTH_DENIED`).
- Session lifecycle: `login_first_bind` then `validate_session` against the
  same isolated auth ingress Phase 03C1A's runner uses, reusing the frozen
  `server/auth/signing.ts` canonical signing implementation unchanged.
- Dashboard-data: `applications_aggregate` (D-047's new endpoint) returns a
  validly shaped, bounded aggregate.

Both runners target the same isolated project's two sibling routes (`/exec/
v1/internal/auth` and `/exec/v1/internal/crud`) and should be run together
during MVP-4's live acceptance, in either order.

## 1. Isolated resources this procedure needs (manual, not automated by this tooling)

1. One fresh, isolated Sheet + Apps Script project — NOT the Phase 03A/03B
   isolated project, NOT the stopped Phase 03C1A manual attempt (D-036: no
   resource from that attempt is reused).
2. Bootstrap the frozen Phase 02 schema, run `migrateAuthSchemaPhase03A()`,
   and confirm the built `apps-script/generated/Code.js` (via `npm run
   gas:build`/`gas:check`) includes the frozen `/v1/internal/auth` route
   AND the `/v1/internal/crud` route (including this stage's new
   `applications_aggregate` operation).
3. Deploy as a Web App exactly as `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md`
   §2 describes (execute as owner, "Anyone" access, HMAC signature as the
   sole authentication boundary, URL suffix `/exec/v1/internal/auth` for the
   auth route and `/exec/v1/internal/crud` for the CRUD route — the same
   deployment, two sibling paths on the same Web App).
4. Set Script Properties with independently generated non-production
   secrets, never reused from any other isolated project or production.
5. Seed exactly one pre-provisioned isolated `Users` row with
   `account_status = Active`, `role = Admin`, and a blank `provider_subject`
   — this is the row `MVP4_TEST_ADMIN_EMAIL` must match, used to exercise
   `login_first_bind` and every CRUD RBAC check as an Admin actor.
6. One non-production Google OAuth Web Client ID for real GIS login (needed
   for the frontend/browser portion of MVP-4's live QA — not exercised by
   `npm run acceptance:mvp4`, which targets the ingress directly).
7. One Vercel Preview deployment with its own env vars pointed at this
   isolated project (see the checklist in the final report of the task that
   produced this document, or `server/auth/env.ts` for the authoritative
   variable list).

## 2. Running the local tooling

### Config-only check (no network call)

```powershell
npm run acceptance:mvp4:check
```

Prints only the shape of what was loaded (URL suffix booleans, whether the
audience/key/email are configured, the HMAC secret's length) — never a
secret value — and exits non-zero with a clear message if anything is
missing, malformed, or looks production-labeled. **This is the only mode
that succeeds when nothing is configured** (with all `MVP4_*` variables
unset, it fails closed immediately with a config-missing message and never
attempts an HTTP request) — this was confirmed as part of preparing this
tooling.

### Full run (requires a live isolated deployment)

```powershell
$env:MVP4_CONFIRM_NON_PRODUCTION = "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION"
$env:MVP4_AUTH_TARGET_URL = "https://script.google.com/macros/s/<isolated-deployment-id>/exec/v1/internal/auth"
$env:MVP4_CRUD_TARGET_URL = "https://script.google.com/macros/s/<isolated-deployment-id>/exec/v1/internal/crud"
$env:MVP4_INTERNAL_AUDIENCE = "hotech-globe-tracker.apps-script.nonprod"
$env:MVP4_HMAC_KEY_ID = "nonprod-k1"
$env:MVP4_HMAC_SECRET = "<the isolated project's own nonprod-k1 secret>"
$env:MVP4_TEST_ADMIN_EMAIL = "<the seeded isolated Admin Users row email>"
$env:MVP4_TEST_ADMIN_SUBJECT = "mvp4-acceptance-admin-subject-1"

npm run acceptance:mvp4

# Also run the existing Phase 03C1A auth-only suite against the same deployment:
# (see docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md for its own env vars)
npm run acceptance:phase-03c1a

# Cleanup: clear every value from the shell session immediately after both runs.
Remove-Item Env:MVP4_CONFIRM_NON_PRODUCTION,Env:MVP4_AUTH_TARGET_URL,Env:MVP4_CRUD_TARGET_URL,Env:MVP4_INTERNAL_AUDIENCE,Env:MVP4_HMAC_KEY_ID,Env:MVP4_HMAC_SECRET,Env:MVP4_TEST_ADMIN_EMAIL,Env:MVP4_TEST_ADMIN_SUBJECT
```

### Exact environment variables (names only — never a value in this document)

| Variable | Purpose |
| --- | --- |
| `MVP4_CONFIRM_NON_PRODUCTION` | Exact literal `I_UNDERSTAND_THIS_IS_NOT_PRODUCTION`, mandatory. |
| `MVP4_AUTH_TARGET_URL` | The isolated deployment's auth ingress URL; must end exactly `/exec/v1/internal/auth`. |
| `MVP4_CRUD_TARGET_URL` | The isolated deployment's CRUD ingress URL; must end exactly `/exec/v1/internal/crud`. |
| `MVP4_INTERNAL_AUDIENCE` | Must match the isolated project's `INTERNAL_AUDIENCE` Script Property. |
| `MVP4_HMAC_KEY_ID` | Must match the isolated project's active HMAC key id. |
| `MVP4_HMAC_SECRET` | The matching secret (32+ characters) for that key id. |
| `MVP4_TEST_ADMIN_EMAIL` | Normalized email of the seeded isolated Admin `Users` row. |
| `MVP4_TEST_ADMIN_SUBJECT` | Any synthetic non-empty string (not a real Google subject) for first bind. |

The runner fails closed (sends no request) if any variable is missing or
malformed, if the confirmation literal does not match exactly, if either
target URL is not HTTPS or does not end with its required suffix, or if the
URL/audience looks production-labeled — exactly like
`server/acceptance/env.ts`'s Phase 03C1A guards.

### Synthetic test data

The runner creates its own synthetic Plan/Application rows during the run
(via `server/acceptance/mvp4-synthetic-data.ts`'s builders), every field
prefixed with the exact literal `__mvp4_test__` (mirroring D-026's Phase 03B
`__phase03b_test__` isolation pattern). No `Users`/`Sessions` row is
seeded by hand beyond the one Admin row in §1.5 — the session itself is a
side effect of the run's `login_first_bind` call, exactly as Phase 03C1A's
runner already does.

**This local-prep stage does not delete anything against a live Sheet** —
that is a manual step (below) for whoever executes the live run, using
`isMvp4SyntheticApplication`/`isMvp4SyntheticPlan`/
`selectMvp4SyntheticApplications`/`selectMvp4SyntheticPlans` (exact
`startsWith` prefix matching only, never a fuzzy match) to find rows safe to
remove, mirroring Phase 03B's `cleanupPhase03BAcceptanceData()` precedent.

### Sanitized output

The runner prints exactly one JSON object to stdout (plus, on a
configuration failure, one line authored by this repository's own
validation code):

```json
{
  "suite": "mvp4-live-acceptance",
  "ok": true,
  "passed": 9,
  "failed": 0,
  "checks": [
    { "name": "session lifecycle: login_first_bind establishes a session", "ok": true, "safeCode": "OK" },
    { "name": "CRUD RBAC: Admin plans_list succeeds", "ok": true, "safeCode": "OK" }
  ]
}
```

It never prints a session/CSRF token, HMAC secret, signature, JTI, Sheet ID,
email address, or raw stack trace — any response containing one is recorded
as `{ "ok": false, "safeCode": "UNEXPECTED" }` instead of being printed, per
the same leakage-scanning approach as
`docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md`.

## 3. Manual steps this tooling does not automate

1. Real non-production GIS login end-to-end against the Vercel Preview
   (browser-driven; this repository's Playwright suite continues to use
   mocked auth per `e2e/dashboard-responsive.spec.ts` and is not a
   substitute for this manual check).
2. Cookie/CSRF/session idle-and-absolute-timeout behavior observed live in
   a real browser session against the Preview.
3. A full create → assign → status-transition → dashboard-refresh workflow
   click-through in the browser, confirming the frozen dashboard visuals
   remain unchanged against live data (per `docs/UI_DASHBOARD_CONTRACT.md`).
4. Deletion of every `__mvp4_test__`-prefixed synthetic row from the
   isolated Sheet (see §"Synthetic test data" above).
5. Full teardown (below).

## 4. Teardown

1. Revoke/delete the isolated Web App deployment.
2. Delete every `__mvp4_test__`-prefixed synthetic row (or delete the whole
   isolated Sheet/project, which is simpler and equally sufficient).
3. Delete the isolated Apps Script project and Sheet.
4. Tear down the Vercel Preview and its env vars.
5. Confirm no secret generated for this procedure is reused anywhere else,
   including a later MVP-5 production configuration.

## Result-recording template

```text
MVP-4 acceptance — executed by: <name>, on: <date>
Isolated Sheet/project: <fresh, independent from every prior isolated attempt — do not paste the Sheet ID or URL here>
Vercel Preview: <do not paste the URL here>
Deployment access mode used: <e.g. Anyone> — exposure/mitigation reviewed: yes/no

npm run acceptance:phase-03c1a summary (paste verbatim, unedited):
<paste the full JSON object>

npm run acceptance:mvp4 summary (paste verbatim, unedited):
<paste the full JSON object>

Manual confirmations:
- [ ] Real non-production GIS login end-to-end succeeded
- [ ] Cookie/CSRF/session idle+absolute timeout behavior observed and correct
- [ ] Full create/assign/transition/dashboard-refresh workflow click-through passed
- [ ] Dashboard visuals unchanged against live data (UI_DASHBOARD_CONTRACT.md)
- [ ] Every `__mvp4_test__`-prefixed row deleted

Teardown confirmations:
- [ ] Isolated Web App deployment revoked/deleted
- [ ] Isolated Apps Script project and Sheet deleted
- [ ] Vercel Preview and its env vars torn down
- [ ] All MVP4_* environment variables cleared from the local shell session
- [ ] No secret generated for this procedure was reused anywhere else

Overall result: PASS / FAIL
Notes: <anything that failed, was skipped, or needs owner attention>
```

## Approval state

**Local tooling only, prepared and unit-tested — not executed against any
live resource.** This document and its tooling do not themselves constitute
MVP-4 acceptance; execution against a live isolated Sheet + Apps Script Web
App + Vercel Preview remains a separate, owner-directed step.
