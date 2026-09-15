# Next Task — MVP-1: Authentication Frontend (planned, not started)

Roadmap reference: **`docs/MVP_COMPLETION_PLAN.md`** — proposed 2026-09-15 by owner change
request, awaiting owner approval of the plan itself.
Architecture reference: **`docs/PHASE_03C_AUTH_PLAN.md` — Owner Approved (2026-09-15), still
binding for all authentication architecture.**

## Roadmap change (2026-09-15)

By owner change request, the remaining roadmap is consolidated into five MVP batches (MVP-1
Authentication Frontend, MVP-2 Core Tracker CRUD, MVP-3 Dashboard Live Data, MVP-4 Final Isolated
Integration QA, MVP-5 Production Release). Old Phase 03C2 becomes MVP-1; old Phase 03D is absorbed
into MVP-4. See `docs/MVP_COMPLETION_PLAN.md` for the full status table, reconciliation and
estimates.

**The manual Phase 03C1A isolated acceptance setup is stopped.** Live ingress acceptance is
deferred and will be performed once, as part of MVP-4's single isolated integration QA, rather
than as its own standalone environment + teardown. No resource created during the stopped attempt
is reused.

## Phase 03C1A status (unchanged approval state)

**Ready for Owner Review. Not Owner Approved. Not FINAL.** It remains Ready for Owner Review until
MVP-4's isolated QA executes and passes its acceptance. Its implementation, tests, and security
controls are preserved in full and must not be weakened:

- The `POST /v1/internal/auth` ingress, its four-operation allowlist, and all ingress validation.
- All 189 passing unit tests, including the 24 ingress tests and 17 acceptance-tooling tests.
- The `npm run acceptance:phase-03c1a` runner, its fail-closed config guards, and its sanitized
  output — to be used unchanged during MVP-4.

The detailed Phase 03C1A implementation record is preserved below for review.

---

## Next batch: MVP-1 — Authentication Frontend

Not started. Scope, exit criteria and estimate are in `docs/MVP_COMPLETION_PLAN.md` §4. Summary:
GIS login screen, browser auth provider/state, integration with the five existing `/api/auth/*`
routes, canonical role redirects, protected role routes, and safe loading/inactive/locked/expired/
error states — with no dashboard redesign.

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
