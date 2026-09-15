# Phase 03C1A isolated Apps Script Web App acceptance

Status: **Prepared only. Not yet executed. Do not deploy from this document without separate owner instruction.**

This procedure is for a fresh, isolated, non-production Sheet and Apps Script Web App deployment only, independent from any Phase 03A/03B isolated-test resource. Do not use production Sheet IDs, users, or secrets, and never reuse a secret generated for this procedure anywhere else.

An automated local runner (`npm run acceptance:phase-03c1a`) now exists and automates all twelve numbered cases in §3 plus the explicit charset case, against a single explicitly configured isolated URL. It replaces manual construction of signed envelopes for acceptance, but the resource setup, deployment, and teardown steps below are still manual and still required. See §3a for exact usage.

## Why a Web App deployment is required here (unlike Phase 03B)

Phase 03B's acceptance suite (`docs/PHASE_03B_ACCEPTANCE_RUNBOOK.md`) runs entirely inside the Apps Script editor and never exposes a public route. Phase 03C1A adds the first HTTP-reachable route (`POST /v1/internal/auth`), so acceptance here must exercise a real deployed Web App URL over HTTP to prove routing, `postData` handling, and response-envelope behavior end-to-end — not just the pure domain functions.

## 1. Isolated resources

1. Create a fresh, isolated Sheet and Apps Script project (do not reuse the Phase 03A/03B isolated project or any production resource).
2. Bootstrap the frozen Phase 02 schema, then run `migrateAuthSchemaPhase03A()` once, matching `docs/PHASE_03B_ACCEPTANCE_RUNBOOK.md` steps 1-2.
3. Build locally with `npm run gas:build` and copy only `apps-script/generated/Code.js` and `appsscript.json` into the isolated project.
4. Set Script Properties as in `docs/PHASE_03B_ACCEPTANCE_RUNBOOK.md` step 4, with **independently generated** non-production secrets (`INTERNAL_HMAC_KEYS_JSON`, `SESSION_TOKEN_PEPPER`, `CSRF_TOKEN_PEPPER`) — never reused from the Phase 03B isolated project or from production. Leave `ACCEPTANCE_TEST_MODE`/`ACCEPTANCE_TEST_SPREADSHEET_ID` unset for this procedure; they are specific to the Phase 03B editor-only suite and are not used by the HTTP ingress.
5. At least one pre-provisioned `Users` row with `account_status = Active` and a blank `provider_subject` is required to exercise `login_first_bind`.

## 2. Deployment

1. Deploy the isolated project as a Web App:
   - Execute as: **owner** (the isolated project's owner, never a production identity).
   - Access: the minimum mode that lets the Vercel BFF call it. Because the BFF is not a Google-authenticated caller, this is expected to require "Anyone" access.
     - **Exposure this creates**: the deployed `/exec/v1/internal/auth` URL is invocable by anyone who has or guesses it, with no Google-account gate at the HTTP layer.
     - **Mitigations already in place**: the HMAC signature inside the frozen `verifyEnvelope` is the sole authentication boundary — an unsigned or incorrectly signed request is rejected before any Sheet access; the JTI replay store rejects reuse; the 16 KiB body cap and strict outer-key/allowlist checks in `apps-script/core/auth-ingress.ts` reject malformed or oversized requests cheaply, before touching Sheet data.
     - **Residual risk accepted for this isolated, non-production procedure**: anonymous access consumes the project's daily Apps Script execution quota even for rejected requests (e.g. a flood of invalid-signature calls). This is a known, accepted operational risk for the isolated acceptance deployment only; it is not evaluated here for a production deployment, which remains out of scope for Phase 03C1A.
   - The deployed URL suffix must be `/exec/v1/internal/auth`.
2. Confirm the isolated `Code.js` was built from this phase's source (matching the `npm run gas:check` output locally) before pasting it into the Apps Script editor.

## 3. Planned acceptance cases (execute manually against the deployed URL)

For each of the four allowed operations (`login_first_bind`, `validate_session`, `issue_csrf`, `logout`), construct a signed envelope offline (e.g. with a short Node script using the same canonical signing algorithm as `server/auth/signing.ts`) using the isolated project's own HMAC key, then POST it to the deployed URL:

1. **Valid signed call, each of the four allowed operations** — expect an `ok: true` envelope with only the fields defined in `AppsScriptAuthResult` (`userId`, `role`, `sessionId`); byte-for-byte inspect the response body for anything beyond that (no Sheet ID, no config, no internal ID, no raw error).
2. **Invalid signature** (flip one character of `signature`) — expect `ok: false`, `error.code: "AUTH_DENIED"`.
3. **Wrong audience** — expect `ok: false`, `error.code: "AUTH_DENIED"`.
4. **Wrong path** inside the envelope (e.g. `validate_session`'s envelope signed for `/internal/v1/auth/logout`) — expect `ok: false`, `error.code: "AUTH_DENIED"`.
5. **Wrong HTTP method** — Apps Script Web Apps do not route non-POST verbs to `doPost`; confirm a GET to the same URL only reaches the frozen health/not-found `doGet` behavior, never the auth dispatcher.
6. **Expired assertion** (`expires_at` in the past, or `issued_at`/`expires_at` beyond the 60-second max TTL) — expect `ok: false`, `error.code: "AUTH_DENIED"`.
7. **Replay** — send the same valid envelope twice; the second call must return `ok: false`, `error.code: "AUTH_DENIED"`.
8. **Malformed body** (not valid JSON) — expect `ok: false`, `error.code: "VALIDATION_ERROR"`.
9. **Unsigned/missing-envelope request** (valid JSON, missing `envelope` key, or `envelope: null`) — expect `ok: false`, `error.code: "VALIDATION_ERROR"`.
10. **Unsupported-operation denial** — send `operation: "rotate_session"` and `operation: "revoke_session"` with an otherwise well-formed envelope; expect `ok: false`, `error.code: "AUTH_DENIED"`, and confirm (via the isolated Sheet's `Activity_Logs`/`InternalRequestReplays` tabs) that no row was written for either call.
11. **Oversized body** — a body just over 16 KiB UTF-8 bytes; expect `ok: false`, `error.code: "VALIDATION_ERROR"`.
12. **Wrong `Content-Type`** (e.g. `text/plain`) — expect `ok: false`, `error.code: "VALIDATION_ERROR"`.

For every case above, inspect the raw HTTP response body byte-for-byte and confirm it contains no stack trace, exception message, configuration value, Sheet ID, secret, signature, JTI, token, hash, or Google claim — only the safe envelope shape.

## 3a. Automated runner (`npm run acceptance:phase-03c1a`)

Once §1 (isolated resources, including at least one seeded `Users` row) and §2 (deployment) are complete, run all twelve cases above — plus an explicit thirteenth case for `Content-Type: application/json; charset=utf-8` — with one command instead of manual construction:

```powershell
npm run acceptance:phase-03c1a
```

### Exact environment variables

Set these in the current PowerShell session only (never commit them, never place them in a `.env` file that could be committed). All are read from `process.env`; the runner accepts no CLI arguments for secrets.

| Variable | Safe placeholder / format |
| --- | --- |
| `PHASE_03C1A_CONFIRM_NON_PRODUCTION` | the exact literal `I_UNDERSTAND_THIS_IS_NOT_PRODUCTION` |
| `PHASE_03C1A_TARGET_URL` | `https://script.google.com/macros/s/<isolated-deployment-id>/exec/v1/internal/auth` (must be HTTPS, must end exactly with `/exec/v1/internal/auth`, must not contain `prod`, `production`, or `live`) |
| `PHASE_03C1A_INTERNAL_AUDIENCE` | must match the isolated project's `INTERNAL_AUDIENCE` Script Property exactly, e.g. `hotech-globe-tracker.apps-script.nonprod` |
| `PHASE_03C1A_HMAC_KEY_ID` | must match the isolated project's `INTERNAL_HMAC_ACTIVE_KEY_ID`, e.g. `nonprod-k1` |
| `PHASE_03C1A_HMAC_SECRET` | the matching secret for that key id from the isolated project's `INTERNAL_HMAC_KEYS_JSON` (32+ characters) |
| `PHASE_03C1A_TEST_USER_EMAIL` | the normalized email of the pre-provisioned isolated `Users` row from §1.5, e.g. `agent-acceptance@example.com` |
| `PHASE_03C1A_TEST_USER_SUBJECT` | any synthetic non-empty string, e.g. `phase03c1a-acceptance-subject-1` (this is not a real Google subject; it is only used once, to exercise `login_first_bind`) |

The runner fails closed (refuses to send any request) if any variable is missing or malformed, if the confirmation literal does not match exactly, if the target URL is not HTTPS, does not end with `/exec/v1/internal/auth`, or looks production-labeled, or if the audience looks production-labeled.

### PowerShell setup and cleanup

```powershell
$env:PHASE_03C1A_CONFIRM_NON_PRODUCTION = "I_UNDERSTAND_THIS_IS_NOT_PRODUCTION"
$env:PHASE_03C1A_TARGET_URL = "https://script.google.com/macros/s/<isolated-deployment-id>/exec/v1/internal/auth"
$env:PHASE_03C1A_INTERNAL_AUDIENCE = "hotech-globe-tracker.apps-script.nonprod"
$env:PHASE_03C1A_HMAC_KEY_ID = "nonprod-k1"
$env:PHASE_03C1A_HMAC_SECRET = "<the isolated project's own nonprod-k1 secret>"
$env:PHASE_03C1A_TEST_USER_EMAIL = "<the seeded isolated Users row email>"
$env:PHASE_03C1A_TEST_USER_SUBJECT = "phase03c1a-acceptance-subject-1"

npm run acceptance:phase-03c1a

# Cleanup: clear every value from the shell session immediately after the run.
Remove-Item Env:PHASE_03C1A_CONFIRM_NON_PRODUCTION,Env:PHASE_03C1A_TARGET_URL,Env:PHASE_03C1A_INTERNAL_AUDIENCE,Env:PHASE_03C1A_HMAC_KEY_ID,Env:PHASE_03C1A_HMAC_SECRET,Env:PHASE_03C1A_TEST_USER_EMAIL,Env:PHASE_03C1A_TEST_USER_SUBJECT
```

### Required synthetic test-user setup and operation sequence

- Exactly the one pre-provisioned isolated `Users` row from §1.5 (`account_status = Active`, blank `provider_subject`) is required; `PHASE_03C1A_TEST_USER_EMAIL` must match its normalized email exactly.
- The runner exercises operations in this fixed order so each later call has the session state it depends on: `login_first_bind` (binds the seeded user and creates a session) → `validate_session` → `issue_csrf` → `logout` (revokes that session) → the remaining negative/edge cases (invalid signature, wrong audience, wrong path, expired, replay of the original login call, disallowed operations, malformed/missing-envelope/oversized/wrong-content-type bodies, and the charset-acceptance case, which may see the session already revoked by the preceding `logout` and treats either a safe success or a safe `AUTH_DENIED` as passing).
- No `Sessions`, `InternalRequestReplays`, or `Activity_Logs` row needs to be seeded by hand; they are created as side effects of the `login_first_bind` call.

### Sanitized output

The runner prints exactly one JSON object to stdout, and prints only that object plus, on a configuration failure, a single one-line error message authored by this repository's own validation code (never derived from a live response body):

```json
{
  "suite": "phase-03c1a-live-acceptance",
  "ok": true,
  "passed": 13,
  "failed": 0,
  "checks": [
    { "name": "valid login_first_bind succeeds", "ok": true, "safeCode": "OK" },
    { "name": "invalid signature is denied", "ok": true, "safeCode": "AUTH_DENIED" }
  ]
}
```

It never prints the generated session token, CSRF token, HMAC secret, signature, JTI, hash, email, Sheet ID, or the target Apps Script URL, in success or failure. If any live response is found to contain a prohibited value (a secret used in this run, a stack trace, a Sheet ID, a raw session/CSRF/signature/JTI field, or any email address), that check is recorded as `{ "ok": false, "safeCode": "UNEXPECTED" }` rather than being printed.

### Cleanup behavior

The runner itself performs no Sheet/deployment cleanup — it only sends HTTP requests and prints the sanitized summary. Synthetic-row, environment-variable, deployment, and Script-Property cleanup remain the manual steps in §5 below, to be performed after reviewing the run's summary.

## 4. BFF-side spot check (optional, still non-production)

If a non-production Vercel Preview is available with `APPS_SCRIPT_INTERNAL_URL` pointed at this isolated deployment, exercise `POST /api/auth/login`, `GET /api/auth/csrf`, and `POST /api/auth/logout` once each to confirm the BFF's updated `server/auth/apps-script-client.ts` response mapping (§E/§F of `docs/NEXT_TASK.md`) behaves as tested locally. This is optional for Phase 03C1A acceptance and does not substitute for the mocked BFF test suite.

## 5. Teardown

1. Revoke/delete the isolated Web App deployment.
2. Delete the isolated Apps Script project and Sheet, or otherwise ensure it is not reachable, matching the Phase 03B precedent (D-026/D-028).
3. Confirm no secret generated for this procedure is reused anywhere else, including in a later Phase 03D isolated Preview environment (Phase 03D must generate its own independent secrets).

## Sign-off

Record the outcome of each numbered case in §3 (pass/fail) before this phase can move from "Ready for Owner Review" to "Owner Approved." This document does not itself constitute execution of the procedure.

### Result-recording template

Copy this into the acceptance record (e.g. a PR description, an owner-review note, or an addition to `docs/DECISIONS.md` once approved). Paste the runner's printed JSON summary in full; do not hand-transcribe individual check results.

```text
Phase 03C1A isolated acceptance — executed by: <name>, on: <date>
Isolated Sheet/project: <fresh, independent from Phase 03A/03B — do not paste the Sheet ID or URL here>
Deployment access mode used: <e.g. Anyone> — exposure/mitigation reviewed: yes/no

Automated runner summary (paste verbatim, unedited):
<paste the full JSON object printed by `npm run acceptance:phase-03c1a`>

Manual confirmations:
- [ ] Case 5 (wrong HTTP method) manually confirmed via GET, since the runner's automated check
      only proves no leakage occurred, not the exact frozen doGet health/not-found body.
- [ ] Every response body across all cases inspected byte-for-byte for leakage beyond what the
      runner's automated scan checks for.
- [ ] Optional §4 BFF-side spot check performed: yes/no (if yes, results: ______)

Teardown confirmations (§5):
- [ ] Isolated Web App deployment revoked/deleted
- [ ] Isolated Apps Script project and Sheet deleted
- [ ] All PHASE_03C1A_* environment variables cleared from the local shell session
- [ ] No secret generated for this procedure was reused anywhere else

Overall result: PASS / FAIL
Notes: <anything that failed, was skipped, or needs owner attention>
```
