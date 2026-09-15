# Next Task — Phase 03C1A: Apps Script Internal Auth Ingress

Previous phase: **Phase 03C1 Vercel BFF Authentication Backend — Owner Approved and frozen
(2026-09-15), limited to its approved local/mocked implementation scope.**
Architecture reference: **`docs/PHASE_03C_AUTH_PLAN.md` — Owner Approved (2026-09-15), binding for
all of Phase 03C.**

Status: **Planned only. Do not implement until separately instructed by the owner.**

## Why this phase exists

Phase 03C1 is Owner Approved but not live-integrated: Apps Script does not yet expose a signed
internal HTTP ingress, so the five BFF routes cannot complete a real authentication flow. Phase
03C1A closes that gap and is a hard prerequisite for Phase 03D (which requires live Apps Script
access) and, in practice, for any meaningful manual testing of Phase 03C2's login flow.

## Objective

Add exactly one new Apps Script Web App route that accepts signed internal-auth envelopes from the
Vercel BFF and dispatches them, unchanged, into the frozen Phase 03B domain
(`executeInternalAuthPhase03B`). Fix the one confirmed BFF-side response-handling gap this exposes.
No frontend work, no live deployment, no dashboard change.

## Binding decisions

### A. Web App ingress

- Add one Apps Script Web App route: `POST /v1/internal/auth`.
- Deployed URL suffix: `/exec/v1/internal/auth`.
- `e.pathInfo` must normalize exactly to `/v1/internal/auth` (via the existing `parsePathInfo`
  helper).
- Any other POST path retains the frozen safe not-found behavior (`handlePost`'s existing `NOT_FOUND`
  response), unchanged.
- `doGet` health-route behavior is unchanged.

### B. Outer request contract

Accept exactly:

```json
{ "operation": "<allowed-operation>", "envelope": { "...frozen Phase 03B envelope..." } }
```

Reject missing, additional, malformed, or incorrectly typed outer keys.

Explicit HTTP-reachable operation allowlist:

- `login_first_bind`
- `validate_session`
- `issue_csrf`
- `logout`

Never expose via `doPost`, under any operation name or code path:

- `rotate_session`
- `revoke_session`
- `bootstrapSchema`
- `migrateAuthSchemaPhase03A`
- `reconcileAuthAuditPhase03B`
- `runPhase03BAcceptanceSuite`
- `cleanupPhase03BAcceptanceData`
- arbitrary/dynamic function dispatch (no lookup keyed by caller-supplied strings against the
  global scope; the allowlist is an explicit `if`/`switch` over the four literals above)

### C. Request validation order (before any dispatch)

1. Confirm path (`/v1/internal/auth`); anything else falls through to the frozen not-found path.
2. Require `e.postData` to be present; reject otherwise.
3. Parse `Content-Type` media type safely: accept `application/json`, optionally with a `charset`
   parameter (e.g. `application/json; charset=utf-8`); reject anything else, including a missing
   type.
4. Enforce a maximum 16 KiB **UTF-8 byte** body size — measure actual UTF-8 byte length, not
   JavaScript string `.length` (which counts UTF-16 code units and undercounts multi-byte
   characters).
5. Strictly parse JSON (`try`/`catch`; a parse failure is a generic safe failure, never the
   parser's message).
6. Validate exact outer keys (`operation`, `envelope`, nothing else) and check `operation` against
   the allowlist in §B before touching the envelope.
7. Invoke the frozen Phase 03B envelope verification (`verifyEnvelope`) and domain dispatcher
   (`executeInternalAuth`, via the existing `executeInternalAuthPhase03B`) unchanged.
8. Never reimplement or weaken the frozen HMAC/session logic — steps 1-6 are new ingress-layer
   checks; step 7 must call the existing frozen functions as-is.

### D. Security boundary

- HMAC verification (inside the frozen `verifyEnvelope`) remains the actual authentication
  boundary.
- Origin/CORS is not authentication and must not gate dispatch (Apps Script `doPost` cannot read
  arbitrary request headers in any case).
- Browser-supplied identity/role/email/actor fields remain untrusted; all authoritative
  user/role/session state continues to come only from the Sheet-backed store via the verified
  envelope.
- No Sheet/domain state access occurs before signed-envelope validation, except loading the
  minimum server configuration (`loadAuthConfig`) required to verify it.
- No request body, envelope, signature, JTI, token, email, sub, hash, Sheet ID, secret, or raw
  error is logged, anywhere on this path.

### E. Response behavior

- Return the existing JSON envelope shape (`ApiResponse<T>` via `success()`/`failure()`) through
  `ContentService`, exactly as `doGet`/`doPost` already do for the health route.
- Apps Script script-authored responses may use HTTP 200 regardless of outcome; the BFF must treat
  the JSON envelope as authoritative, never the HTTP status, for anything the script itself
  decided.
- Safe Apps Script failure codes for this route:
  - validation, signature, time, replay, unsupported-operation, and authorization denial →
    `AUTH_DENIED`
  - lock/concurrency contention → `CONFLICT`
  - configuration, storage, unexpected, and execution failure → `INTERNAL_ERROR`
- Never return a caught error's message, a stack trace, configuration, or any internal ID in the
  response body.

BFF-side mapping (see §F and the required `apps-script-client.ts` fix):

- HTTP 408/429/5xx from the Google edge (never from the script itself) → upstream unavailable
- HTTP 200 + `ok:true` → success
- HTTP 200 + `ok:false` + `error.code === "AUTH_DENIED"` → denial
- HTTP 200 + `ok:false` + `error.code` is `CONFLICT` or `INTERNAL_ERROR` → upstream unavailable
- Malformed/non-JSON "success" response → upstream unavailable

### F. BFF timeout/retry

- Add an explicit 12-second `AbortController` timeout to the Apps Script `fetch` call in
  `server/auth/apps-script-client.ts`.
- A timeout maps to `AUTH_SERVICE_UNAVAILABLE` (same as today's `AppsScriptUnavailableError` →
  `AUTH_SERVICE_UNAVAILABLE`/`UPSTREAM_UNAVAILABLE` mapping per route).
- No automatic retry for any auth/session mutation call.
- `Cache-Control: no-store` on all browser-facing responses is preserved unchanged.

### G. Tests to plan (local + generated-artifact only; no live calls)

- Valid allowed operation → correct dispatch and success envelope.
- Exact outer-key enforcement (missing key, extra key, wrong type for `operation`/`envelope`).
- Every disallowed/editor-only operation (`rotate_session`, `revoke_session`, and all five
  editor-only function names) → rejected before any dispatch, with an audit-free negative check
  (no store write occurs).
- Malformed JSON body.
- Missing `postData`.
- `application/json` with a `charset` parameter → accepted.
- Wrong `Content-Type` (e.g. `text/plain`, missing) → rejected.
- UTF-8 body size at/below/above the 16 KiB limit, including a multi-byte-character case that
  proves byte-length (not `.length`) is what's enforced.
- Wrong route (`pathInfo` mismatch) → falls through to the existing frozen not-found behavior.
- Invalid signature, wrong method/path/audience, expired assertion, replayed JTI — all via the
  existing frozen `verifyEnvelope`/replay-store tests, re-confirmed reachable through the new
  ingress.
- Safe error classification (`AUTH_DENIED`/`CONFLICT`/`INTERNAL_ERROR`) for each triggering
  condition.
- No raw-error/secret leakage in any response body across all of the above.
- BFF-side: HTTP-200 Apps-Script-failure-envelope mapping (`AUTH_DENIED`/`CONFLICT`/
  `INTERNAL_ERROR` each mapped correctly).
- BFF-side: Google-edge non-200 (408/429/5xx) mapping, distinct from script-level failure.
- BFF-side: 12-second timeout fires and maps to `AUTH_SERVICE_UNAVAILABLE`.
- BFF-side: confirm no automatic retry occurs.
- Regression: `doGet` health route unchanged.
- Regression: all existing frozen Phase 03A/03B domain tests unchanged (33 tests).
- Regression: `npm run gas:build` + `npm run gas:check` — generated artifact contains only the
  approved global entrypoints/routes, no unresolved modules, no Node-only APIs, no source maps.

### H. Isolated acceptance plan (prepare only — do not execute or deploy)

- Isolated, non-production Sheet and Apps Script deployment, independent from any Phase 03A/03B
  isolated-test resource.
- Execute as: owner.
- Access restricted to the minimum mode that permits the Vercel BFF to call it; if anonymous
  ("Anyone") access is required — which is expected, since the BFF is not a Google-authenticated
  caller — document that exposure explicitly in the acceptance runbook, including the operational
  mitigations (signature-only boundary, execution-quota risk) before it is ever deployed.
- Independently generated, non-production secrets (`INTERNAL_HMAC_KEYS_JSON`, peppers), never
  reused from Phase 03B's isolated tests or from any production value.
- Planned acceptance cases: valid signed calls for all four allowed operations; invalid
  signature/audience/path/method/expiry cases; replay; malformed and unsigned requests;
  unsupported-operation denial; byte-for-byte response-body inspection for leakage.
- Revoke/delete the isolated deployment after acceptance, matching the Phase 03B precedent
  (D-026/D-028).

### I. Scope exclusions

Do not implement in Phase 03C1A:

- GIS frontend/login page
- Browser auth provider/state
- Dashboard route guards
- Phase 03C2 or Phase 03D work
- Application CRUD, uploads, or reports
- Production deployment
- Any dashboard change

## Required changes by file (planned, not yet made)

| File | Change | Frozen or extended |
| --- | --- | --- |
| `apps-script/Code.ts` | New ingress function wired into `doPost`, calling the existing unmodified `executeInternalAuthPhase03B`. | Extends `doPost`; no change to Phase 03A/03B domain logic. |
| `apps-script/core/auth-envelope.ts`, `auth-domain.ts`, `auth-crypto.ts`, `auth-config.ts`, `session-lifecycle.ts`, `first-bind.ts`, `sheet-auth-store.ts` | None. | Frozen, unchanged. |
| `server/auth/apps-script-client.ts` | Add the 12s `AbortController` timeout; change response handling to parse `body.error.code` (`AUTH_DENIED`/`CONFLICT`/`INTERNAL_ERROR`) instead of collapsing every non-`ok:true` HTTP-200 body into one error type. | Phase 03C1A remediation to Phase 03C1's own code, not a Phase 03B change. |
| `scripts/check-apps-script-artifact.mjs` | Verify it still passes against the new entrypoint; change only if it does not. | Verify unchanged. |

## Verification and acceptance (for when this phase is implemented)

- All of §G's local/mocked/generated-artifact tests passing.
- Formatting, lint, typecheck, full unit test suite, Apps Script build/artifact checks, production
  build, frozen-dashboard Playwright regressions, credential/log scan, `git diff --check`.
- Isolated Apps Script Web App acceptance per §H, executed only after local verification passes and
  only with independent non-production secrets.
- No production resource, push, or deployment at any point in this phase.

Approval state: **Planned — awaiting owner instruction to implement.**
