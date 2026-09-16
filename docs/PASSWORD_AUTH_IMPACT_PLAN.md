# Password Authentication Migration — Impact Analysis Plan

Status: **Planning only. Not implemented. Not started. Not Owner Approved.**

This document is the response to an owner change request (2026-09-16, recorded as D-049 in
`docs/DECISIONS.md`) to replace Google Identity Services (GIS/OIDC) authentication with
Admin-managed email/username + password authentication. Per that request's explicit instruction,
**this is a planning-only impact report.** No source file, dependency, schema, or test has been
changed to produce it. Nothing here is authorized for implementation until the owner reviews this
plan and gives explicit approval to proceed, batch by batch, the same way MVP-2 required D-039
before any code was written.

This supersedes GIS/OIDC as the intended production login method once approved. It does not
retroactively unapprove MVP-1 as a historical record of what was built and verified — it proposes
replacing that approved scope going forward, exactly as the change request frames it ("replaces the
previously approved Google-login architecture").

---

## 1. Files/modules to retire, preserve, extend, or add

### Retire entirely (Google/OIDC-specific, no password-auth equivalent needed)

| File | Reason |
| --- | --- |
| `src/auth/google-identity-services.ts` | GIS script loader — no password-auth use. |
| `server/auth/google-verifier.ts` | ID-token verification, Google domain policy — no equivalent. |
| `server/auth/nonce-store.ts` | OIDC nonce-replay binding — password auth has no ID-token nonce to bind. (The Upstash atomic-consume *pattern* may be reused for password-reset tokens — see §6 — but as a new, separately named store, not this one repurposed in place, to avoid conflating two different security properties under one name.) |
| `api/auth/nonce.ts`, `server/auth/routes/nonce.ts` | The nonce endpoint has no purpose without GIS. |
| `apps-script/core/first-bind.ts` | The "first bind of a Google `sub`" policy has no password-auth analogue. |
| `server/test/google-verifier.test.ts`, `server/test/nonce-store.test.ts`, `server/test/routes/nonce.test.ts` | Test the retired modules directly. |

### Preserve unchanged (generic session/security infrastructure — confirmed via the codebase audit)

`server/auth/cookies.ts`, `csrf.ts`, `crypto.ts`, `signing.ts`, `rate-limit.ts` (bucket list extended,
not rewritten — see §6), `origin-check.ts`, `http-envelope.ts`, `vercel-adapter.ts`, `roles.ts`,
`respond.ts`, `apps-script-client.ts`; `apps-script/core/session-lifecycle.ts`, `auth-config.ts`,
`auth-envelope.ts`, `auth-crypto.ts`, `auth-ingress.ts`; `src/auth/types.ts`, `role-mapping.ts`,
`auth-state-view.tsx`, `protected-route.tsx`, `routes/constants.ts`; every CRUD file
(`server/crud/*`, `apps-script/core/{plans,users,applications}-repository.ts`,
`crud-domain.ts`/`crud-ingress.ts`, `dashboard-aggregate.ts`) and every CRUD test — none of this is
Google-specific and none of it is touched by this migration. This is the majority of the auth
surface area by file count and by test count.

### Extend (currently mixed Google-specific/generic — edit in place, do not rewrite)

| File | What changes |
| --- | --- |
| `server/auth/route-types.ts` | Remove `googleVerifier`, `nonceStore`, `isPermittedGoogleAccountDomain` from `RouteDependencies`; add `passwordVerifier` (or equivalent) dependency. |
| `server/auth/wiring.ts` | Swap the Google-verifier/nonce-store construction lines for password-verifier construction; Redis/rate-limiter/Apps-Script-client wiring is unchanged. |
| `server/auth/env.ts` | Remove `googleClientId`/`GOOGLE_CLIENT_ID`; add whatever password-hashing config is needed (see §3 — e.g. an Argon2id parameter set, not a secret value itself, since the hash is per-user and salted, not a shared pepper the way session/CSRF tokens are). |
| `server/auth/security-headers.ts` | Remove the three `accounts.google.com` CSP allowances (`script-src`, `style-src`, `frame-src`, `connect-src`) once the GIS script is no longer loaded. |
| `apps-script/core/auth-domain.ts` | Replace the `login_first_bind` branch's Google-`sub` logic with password verification (see §6); `validate_session`/`rotate_session`/`issue_csrf`/`logout`/`revoke_session` and the shared `resolveAuthenticatedActor`/`requireSessionCsrf` exports are unchanged. |
| `apps-script/core/sheet-auth-store.ts` | `SheetAuthStore.users()` stops reading column 9 (`provider_subject`) for authorization purposes; `updateUser()`'s narrow `Partial<Pick<AuthUser, "providerSubject">>` signature must grow to also patch password-hash/lockout fields (see §5). |
| `src/pages/login-page.tsx` | Full rewrite of its body (form instead of GIS button/script), but keeps its `DashboardCard` shell, generic-error rendering, and post-login `safeDestinationForRole` redirect call unchanged. |
| `src/auth/api-client.ts` | Replace `submitGoogleCredential(credential)` with a password-login call (e.g. `submitPasswordLogin({ identifier, password })`); `fetchCurrentSession`, `fetchCsrfToken`, `logout`, the envelope/error-mapping helper, and `AuthApiError` are unchanged. |
| `src/auth/auth-context.tsx` | Rename/replace `loginWithGoogleCredential` with the password-login entry point; the `AuthState` machine, `refresh()`, and `logout()` are unchanged. |
| `src/config/env.ts` | Remove `googleClientId`. |

### Add (new)

- BFF: a password-login route (`api/auth/login.ts` body rewritten, or split if clearer), a
  password-change route, a forced-first-change flow, an Admin-facing create-user route extension
  (MVP-2B's `PATCH /api/users/:userId` already exists for role/status — creation and temporary-password
  issuance are new), a password-reset-issuance route (Admin-triggered, per the change request's
  "Admin may reset a password" requirement — there is no self-service "forgot password" in the
  request, so none is planned).
- Apps Script: a password-verification branch in `auth-domain.ts` (or a new sibling module,
  `password-auth.ts`, mirroring `first-bind.ts`'s role as a focused policy module — leaning toward a
  new module so `first-bind.ts` can simply be deleted rather than mutated, keeping the diff legible).
- Frontend: password login form, password-visibility toggle, forced-change screen, Admin
  create-user form, Admin reset-password action + one-time-credential display screen.
- Schema: one new Apps Script migration (see §5) — never edits to the existing frozen
  `migrateAuthSchema()` in `auth-schema.ts`, matching this project's own append-only migration
  convention (Phase 03A never rewrote Phase 02's `schema.ts`; this migration must not rewrite
  Phase 03A's either).

---

## 2. Exact schema migration and columns

Following the append-only convention every prior auth migration in this repo has used (Phase 02 →
03A never modified an earlier migration; each adds a new, separately versioned migration function):

**New migration, `apps-script/core/auth-schema-v2.ts`** (name illustrative), gated by a new schema
version marker (e.g. `AUTH_SCHEMA_VERSION_V2 = "phase-mvp6-password-v1"`, stored in a Script
Property separate from the existing `AUTH_SCHEMA_VERSION` so the migration is independently
idempotent and independently checkable, exactly like `migrateAuthSchema()` already checks its own
version before running).

Per the change request's own suggested shape, in a **separate `Credentials` sheet/tab** (not
appended to `Users`), keyed by `user_id`:

```
credential_id, user_id, login_identifier_normalized, password_hash, password_algo,
password_algo_params, must_change_password, password_changed_at, failed_login_count,
locked_until, created_at, updated_at
```

Rationale for a separate tab rather than more `Users` suffix columns: `Users` is the frozen Phase 02
`schema.ts` table plus the frozen Phase 03A `auth-schema.ts` suffix — this migration touches neither.
A separate `Credentials` tab is strictly additive (one new `initializeSchema`-style tab creation,
mirroring how Phase 03A added `Sessions`/`InternalRequestReplays` as new tabs rather than growing
`Users` indefinitely) and keeps password material physically separate from the profile/role data
every CRUD operation already reads — no CRUD list/read/update path for Plans/Users/Applications
would ever need to touch this tab, so its existence does not enlarge the blast radius of any
already-implemented MVP-2 code. `password_algo`/`password_algo_params` are stored per-row (not just
globally configured) specifically so a future algorithm-parameter change doesn't silently invalidate
already-hashed passwords — verification reads the row's own recorded parameters.

**Existing `Users` suffix columns, disposition:**
- `provider_subject`, `auth_provider`, `email_verified_at` — become **dormant**, not deleted. Per
  the change request's own item 5 ("clearly decide whether legacy auth columns remain dormant... or
  are migrated later"): the recommendation is **dormant**, not migrated/dropped, because (a) this
  repo's schema convention is strictly append-only/never-destructive (D-012, D-020: bootstrap and
  every migration explicitly reject overwriting existing non-empty data), and (b) dropping a column
  is exactly the kind of irreversible data action the working rules single out for extra caution.
  `auth-domain.ts`'s password-branch code simply never reads `provider_subject` for authorization
  once this migration ships; the column stays in the sheet as inert historical data.
- `session_version`, `last_login_at`, `last_logout_at` — **directly reused, no schema change.**
  `session_version` in particular is the exact mechanism the change request's own requirement
  ("password changes/resets revoke existing sessions and increment session_version") already
  depends on — `session-lifecycle.ts`'s `validateSession` already invalidates on a version mismatch;
  a password-change handler just needs to call the existing bump, not build a new mechanism.
- `failed_auth_count`, `locked_until` — the audit found these **scaffolded on `Users` but not yet
  wired into any read/write path** in the current codebase. Two options: (a) reuse them directly for
  password-lockout tracking, since they already exist and are unused, or (b) use the new
  `Credentials.failed_login_count`/`locked_until` instead and leave the `Users` columns dormant like
  `provider_subject`. **Recommendation: (b)**, for the same separation-of-concerns reason as putting
  password material in its own tab — lockout state is a credential-security concern, not a
  profile/role concern, and keeping it in `Credentials` means a future credential-rotation or
  external-IdP-re-adoption story doesn't have to pick through `Users` columns that mean different
  things depending on which auth generation wrote them. This is flagged explicitly because it is a
  judgment call, not a hard technical requirement — the owner may prefer (a) to avoid adding two
  more columns that duplicate existing ones.

---

## 3. Password hashing runtime/dependency decision

**Hard constraint confirmed by the codebase audit:** Apps Script V8's only crypto primitives are
`Utilities.computeDigest` (SHA-256) and `Utilities.computeHmacSha256Signature` (HMAC-SHA256) — no
native Argon2, bcrypt, or scrypt, and no ability to install npm packages at runtime. This repo's
existing `hashSecret()` pattern (keyed HMAC with a shared pepper) is how session/CSRF *tokens* are
hashed today, and is explicitly unsuitable for password storage (not memory-hard, not
individually-salted beyond a shared pepper, no tunable work factor).

**Therefore password hashing cannot run in Apps Script.** It must run in the Node.js BFF
(`server/`), where `node:crypto` and npm packages are available. This is a material architectural
fact the owner should confirm before implementation proceeds, since it changes where the
"authoritative" check happens for this one operation:

- Every other authorization decision in this project is deliberately Apps-Script-authoritative
  (D-011, and repeated throughout NEXT_TASK.md: "RBAC is enforced only in Apps Script... a
  client-side/BFF check is never authoritative").
- Password **verification** (comparing a submitted password against the stored hash) must happen in
  the BFF, because Apps Script cannot compute or verify an Argon2id hash. This does not weaken
  authorization: the BFF verifies the password and, only on success, calls the same
  signed-envelope `login_first_bind`-equivalent Apps Script operation used today — Apps Script
  remains authoritative for *issuing the session and deciding the user's role/account status*, it
  simply does not perform the password comparison itself. Apps Script would instead store and, if
  ever needed for a future migration, compare hashes using the two primitives it does have — but the
  recommended design has Apps Script never compute a password hash at all, only store what the BFF
  computed and forward it on lookup.
- Concretely: the BFF reads `password_hash`/`password_algo`/`password_algo_params` for the
  `login_identifier_normalized` via a new CRUD-style read (through the same signed envelope, RBAC
  aside since this is a pre-session bootstrap-of-identity step, analogous to how `login_first_bind`
  today reads a pre-provisioned user row before a session exists), verifies the submitted password
  against it locally in Node, and — only on match — calls Apps Script to mint the session, exactly
  mirroring the shape of today's `login.ts` (verify externally, then hand off to Apps Script to
  issue the session) rather than a new architecture.

**Algorithm recommendation:** Argon2id via `@node-rs/argon2` (a maintained native-binding npm
package; Vercel's Node.js serverless runtime supports native addons, unlike Apps Script). Fallback
if native-binding compatibility with Vercel's build/runtime proves an issue at implementation time:
`node:crypto`'s built-in `scryptSync` (no new dependency, memory-hard, well-understood, explicitly
allowed as "an approved strong adaptive alternative" per the change request's own wording) with
tuned N/r/p parameters recorded per-row in `password_algo_params`. This decision should be confirmed
empirically at implementation time (a spike installing the dependency into this exact Vercel project
and confirming it deploys) rather than assumed here — flagged as an open implementation-time
verification step, not a blocker to approving this plan.

Per-password random salt: both Argon2id and `scrypt` generate/require their own salt as part of the
algorithm; no separate salt column is needed beyond what's encoded in the stored hash string itself
(Argon2id's standard encoded-hash format embeds the salt; the `Credentials` schema in §2 stores the
opaque `password_hash` string as one field for this reason, not a split hash+salt pair).

---

## 4. One-time initial Admin bootstrap design

Mirrors the existing Phase 02/03A pattern (an editor-only, non-HTTP-exposed Apps Script function,
gated by Script Properties, idempotent, fails closed) rather than inventing a new bootstrap
mechanism:

- A new editor-only Apps Script function (e.g. `bootstrapInitialAdminPassword()`), never exposed
  through `doGet`/`doPost` — same non-negotiable constraint every prior bootstrap function in this
  codebase already follows (D-012's rule for the schema bootstrap applies identically here).
- Reads a one-time bootstrap value from a Script Property (e.g. `INITIAL_ADMIN_BOOTSTRAP_TOKEN`),
  set manually by the owner in the Apps Script editor — never committed to source, matching every
  other secret in this project.
- On first successful run: creates (or finds the existing pre-provisioned) initial Admin `Users`
  row, computes and stores a password hash for a **temporary** password (either generated
  server-side and displayed once in the Apps Script execution log for the owner to copy — never
  written to a Sheet cell in plaintext — or accepted via a second Script Property the owner sets and
  clears immediately after), sets `must_change_password = true`, and then **deletes or invalidates
  the bootstrap token Script Property so the function becomes a no-op on any subsequent run** —
  satisfying the change request's "bootstrap must become unusable after the initial Admin is
  established."
- This function requires direct Apps Script editor access, which is already how this project treats
  every sensitive one-time operation (the Phase 02 schema bootstrap, Phase 03A/03B isolated
  acceptance) — no new trust boundary is introduced.

---

## 5. Route/request/response contracts (illustrative, not final — confirmed at implementation time)

Reuses the existing `BffResponse<T>` envelope and `BffErrorCode` taxonomy unchanged, per this
project's own working rule of never inventing a new envelope/error shape per feature.

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | none (pre-session) | `{ identifier, password }` → session+CSRF cookies, or `must_change_password: true` redirect signal |
| `/api/auth/change-password` | POST | session (any role, self) | `{ currentPassword, newPassword }` (or `{ newPassword }` only when `must_change_password` is set, per the forced-change flow) → revokes existing sessions via `session_version` bump, re-issues a fresh session |
| `/api/users` (existing, MVP-2B) | POST | session, Admin only | Extended to accept new-user creation with an auto-generated temporary password, returned **once** in the response body only, never persisted in any log |
| `/api/users/:userId/reset-password` | POST | session, Admin only | Issues a new one-time temporary password for an existing user, sets `must_change_password = true`, revokes that user's existing sessions |

`ACCOUNT_LOCKED`/`ACCOUNT_INACTIVE` (already in the existing `BffErrorCode` taxonomy per the
codebase audit) gain password-lockout meaning; no new error code is needed for the core flows. One
new safe generic error may be needed for "must change password" as a distinct signal from a hard
failure (implementation-time detail, not a taxonomy redesign).

---

## 6. Admin create/reset workflow

- Admin-only, reusing the exact RBAC pattern MVP-2B already established (`resolveAuthenticatedActor`
  session-derived actor, Admin-only gate enforced in Apps Script, never the BFF/client).
- Temporary password generation: BFF-side cryptographically random string (reusing
  `server/auth/crypto.ts`'s existing `randomToken`-style primitive, formatted to be human-typeable),
  hashed before being sent to Apps Script for storage — Apps Script never receives or stores a
  plaintext password, only the hash, matching the architectural boundary in §3.
- The one-time plaintext temporary password is returned in the HTTP response body to the Admin's
  own authenticated request only, rendered once in the Admin UI (e.g. a copy-to-clipboard modal that
  warns it won't be shown again), and is never written to `Activity_Logs`, never included in any
  audit metadata field (the existing `appendActivityLog` calls already follow a "safe, non-secret
  fields only" rule per D-014/NEXT_TASK.md §G — this is a direct application of that existing rule,
  not a new one), and never logged server-side.
- Reset-password follows the identical shape: generate, hash, store, set
  `must_change_password = true`, bump `session_version` (revoking that user's existing sessions
  immediately, per the change request's explicit requirement), return once.

---

## 7. Forced-change workflow

- `must_change_password = true` on the `Credentials` row is checked at login time (BFF reads it
  alongside the password hash); on a successful password verification with this flag set, the BFF
  issues a **restricted** session (or a distinct short-lived "must-change" token — implementation-time
  decision) that is only accepted by the change-password route, not by any CRUD route, until the
  change completes.
- On successful change: clear `must_change_password`, update `password_changed_at`, bump
  `session_version` (invalidating the restricted session and any other outstanding session for that
  user, then issuing one fresh normal session), matching the change request's explicit
  session-revocation requirement.
- Frontend: `AuthState` gains a `must-change-password` variant (or reuses the existing `error`
  variant with a distinct code) so `ProtectedRoute` and the login page can render the forced-change
  form instead of proceeding to a dashboard.

---

## 8. Lockout and rate-limit rules

Extends `server/auth/rate-limit.ts`'s existing single-literal bucket table (confirmed by the audit
to be a well-contained, single-object edit point) rather than restructuring it:

- Retire `nonce-minute`, `nonce-hour`, `login-sub` (the last was keyed on Google `sub`, which no
  longer exists).
- Add `login-identifier` (keyed on HMAC of the normalized login identifier, mirroring how
  `login-sub` was keyed on HMAC of the Google `sub` — same `privacyKeyFor` helper, no new pattern) —
  progressive backoff per the change request's "progressive rate limiting" requirement (e.g.
  widening window after repeated failures, implementation-time tuning).
- `login-ip` (existing, generic, unchanged) continues to apply per-IP regardless of identifier.
- **Persistent lockout** (`Credentials.locked_until`), distinct from and in addition to the
  short-window Upstash rate limits: after N consecutive failed attempts (implementation-time
  constant, e.g. 5), set `locked_until` to a future timestamp; login checks this and returns
  `ACCOUNT_LOCKED` regardless of rate-limit state, matching the "temporary lockout" requirement as a
  durable-storage concern (Upstash rate limits reset on their own window; a deliberate lockout should
  survive that and be visible/reset-able by an Admin via the reset-password flow, which should also
  clear `locked_until`/`failed_login_count`).

---

## 9. Migration impact on completed MVP-1 through MVP-4 tooling

- **MVP-1 (Owner Approved, frozen, D-037):** This migration is itself the "explicit owner change
  request" D-037 already anticipated as the mechanism for future material login/dashboard-auth UI
  changes. MVP-1's approval record stays historically accurate (what was built, tested, and
  approved on 2026-09-16) — D-037 is not edited or deleted; a new decision supersedes its *current
  production intent*, exactly the same pattern already used elsewhere in this project (e.g. Phase
  03C2 "superseded, becomes MVP-1" in D-035, rather than rewriting Phase 03C2's own history).
- **MVP-2A–2F, MVP-3 (checkpoint commits, D-039 through D-048):** **No impact.** The codebase audit
  confirms zero Google/GIS dependency anywhere in the CRUD or dashboard-aggregate code — every file
  in `server/crud/`, `apps-script/core/{plans,users,applications}-repository.ts`,
  `crud-domain.ts`/`crud-ingress.ts`, `dashboard-aggregate.ts`, and their tests is unaffected. These
  batches depend only on `resolveAuthenticatedActor`/`requireSessionCsrf` and the generic session
  chain, which this migration explicitly preserves unchanged.
- **MVP-4 local tooling (D-048, `server/acceptance/`, `docs/MVP4_ACCEPTANCE_RUNBOOK.md`,
  `docs/PHASE_03C1A_ACCEPTANCE_RUNBOOK.md`):** Needs real edits before live acceptance can run
  end-to-end: both runbooks' setup steps currently instruct seeding a blank-`provider_subject` row
  to exercise `login_first_bind`, and `MVP4_ACCEPTANCE_RUNBOOK.md` explicitly lists "one non-production
  Google OAuth Web Client ID" as a required external resource and "real non-production GIS login" as
  a required manual step. Both must be rewritten to describe password-based bootstrap/login instead.
  The isolated-Sheet/Apps-Script-deployment/teardown machinery itself, and the CRUD/RBAC/dashboard
  acceptance cases, are unaffected. This rewrite should happen as part of implementing this
  migration, not before — no point updating the runbook for a login method that doesn't exist yet.
- **`docs/MVP_COMPLETION_PLAN.md`:** Several historical status-table entries reference GIS as MVP-1's
  delivered scope (accurate history, kept) and MVP-4's plan (needs updating to describe password-auth
  live acceptance instead, once this migration is approved and scheduled).

---

## 10. Test strategy

- **Retire directly:** `server/test/google-verifier.test.ts`, `nonce-store.test.ts`,
  `routes/nonce.test.ts` — test only retired modules.
- **Rewrite:** `server/test/routes/login.test.ts` (GIS-flow-specific today), the first-bind portions
  of `apps-script/test/phase-03b.test.ts`/`phase-03b-acceptance.test.ts`, `server/test/fakes/route-deps.ts`
  (drop the fake `googleVerifier`/`nonceStore`, add a fake password verifier),
  `src/pages/login-page.test.tsx`/`login-page-unavailable.test.tsx`, `src/auth/api-client.test.ts`'s
  login-specific cases, `src/auth/auth-context.test.tsx`'s `loginWithGoogleCredential` cases.
- **New:** password-hashing/verification unit tests (BFF-side, deterministic vectors — same
  "isolated editor suite uses deterministic non-secret vectors" convention D-027 already established
  for the existing crypto code), Admin create/reset-password RBAC and one-time-display tests,
  forced-change-flow tests, lockout/rate-limit tests (progressive backoff, persistent lockout,
  Admin-clears-lockout), bootstrap-function idempotency/single-use tests (mirroring how
  `schema-bootstrap.test.ts` already tests the existing bootstrap's idempotency), migration tests for
  the new `Credentials` tab (mirroring `phase-03a.test.ts`'s existing migration-test shape: exact
  headers, no duplicate tabs on rerun, no overwrite of existing non-empty data).
- **Unaffected, run as regression:** every CRUD test (140 Apps Script + the CRUD portion of the 453
  unit tests as of `d0cf317`), every Playwright frozen-dashboard regression (19), format/lint/typecheck.
  These numbers will need re-establishing as a fresh baseline once the retired/rewritten tests are
  actually removed/replaced — the current 453/156/19 totals are a pre-migration baseline, not a
  target to preserve exactly (test counts will shift as GIS-specific tests are removed and
  password-auth tests are added).

---

## 11. Revised MVP-4 acceptance requirements

Once implemented, MVP-4's live acceptance changes from "real non-production GIS login end-to-end"
to: real password login end-to-end (including a forced-first-change click-through using the
bootstrap-generated temporary Admin password), an Admin creating an Agent/Processor account through
the live UI and confirming the one-time temporary password display, that new user completing forced
first-login change, and a lockout-then-Admin-reset cycle. The "Google OAuth Web Client ID" external
resource requirement (§10 of `MVP4_ACCEPTANCE_RUNBOOK.md`) is removed from the external-setup
checklist entirely — one fewer external dependency for live acceptance, not an additional one.

---

## 12. Security risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Password hashing cannot run in Apps Script (hard platform limit) | BFF-side Argon2id/scrypt verification before handoff to Apps Script for session issuance (§3) — Apps Script remains authoritative for the session/role decision, not for the hash comparison itself. This is a real, load-bearing architectural change from "Apps Script decides everything" and should be explicitly acknowledged and accepted by the owner, not glossed over. |
| Shared/weak passwords, credential stuffing | Minimum length + weak-password blocklist (change request's own requirement 4); this project has no MFA today for either auth method — password auth has no inherent equivalent to Google's own account-security signals (anomaly detection, breach-password warnings) that GIS implicitly provided for free. Flagged as an accepted trade-off, not something this migration can fully replace. |
| Password reuse across services (this project stores its own hash, unlike delegating to Google) | Argon2id with tuned work factor makes offline cracking of a leaked hash expensive; this is the standard mitigation, not a full replacement for not storing passwords at all. |
| Temporary/reset password exposure | Never logged, never stored in `Activity_Logs` metadata, displayed exactly once, forced change on first use (§6/§7) — directly satisfies the change request's own requirements. |
| Timing side-channels on login/verification | Constant-time comparison already exists in this codebase (`constantTimeEquals` in both `server/auth/crypto.ts` and `apps-script/core/auth-crypto.ts`) and Argon2id/scrypt verification functions are constant-time by design — no new primitive needed. |
| Losing Google's session-security signals (device/anomaly detection) | Not directly replaceable; the existing session idle/absolute timeouts, CSRF double-submit, and session-version revocation (all unchanged, generic infra) remain the mitigations, same as they are today for GIS sessions after the initial login. |
| A single initial-Admin bootstrap token being reused or leaked | Single-use, editor-only, non-HTTP-exposed, self-invalidating (§4) — matches this project's existing bootstrap-security pattern exactly. |
| Migration irreversibility / data loss | Strictly additive schema migration (new tab, dormant old columns, no destructive edit) — matches this project's own append-only convention and explicit prior decisions (D-012, D-020) against overwriting existing data. |

---

## 13. Estimated implementation sessions

Using this project's own established estimation convention (Claude Sonnet Medium, per
`MVP_COMPLETION_PLAN.md` §5):

| Batch | Estimated sessions | Main drivers |
| --- | --- | --- |
| Schema migration + BFF password hashing/verification core | 1–2 | New `Credentials` tab migration, Argon2id/scrypt dependency spike and integration, hash/verify primitives with tests. |
| Apps Script password-verification domain wiring | 1 | New verification branch in `auth-domain.ts` (or new sibling module), `SheetAuthStore` extension, retiring `first-bind.ts`. |
| Login route rewrite + forced-change flow | 1–2 | New `/api/auth/login` body, `/api/auth/change-password`, restricted-session handling, rate-limit bucket changes. |
| Admin create/reset-password workflow (BFF + frontend) | 1–2 | Extends existing MVP-2B Users route; one-time-credential display UI is new frontend surface. |
| Frontend login/forced-change UI + full regression pass | 1–2 | Login page rewrite, forced-change screen, updated Playwright stubs, retiring/rewriting the GIS-specific test files listed in §10. |
| Bootstrap function + MVP-4 runbook rewrite | 1 | Editor-only bootstrap function with tests; both acceptance runbooks updated to remove GIS/OAuth-client requirements. |
| **Total** | **6–10 sessions** | Comparable in scale to MVP-2's original 4–6 estimate, because this touches BFF, Apps Script, and frontend simultaneously the same way MVP-2 did, plus a genuinely new cross-cutting concern (password hashing) MVP-2 didn't have. |

---

## Required owner decisions before implementation can begin

Per this plan's own findings, the following are genuine open judgment calls, not yet decided by the
change request's text, and should not be silently resolved by whoever implements this:

1. **§2** — `failed_auth_count`/`locked_until`: reuse the existing dormant `Users` columns, or add
   equivalents on the new `Credentials` tab (recommended)?
2. **§3** — Argon2id via a native-binding npm package, or `node:crypto` `scrypt` as the primary
   choice (not just a fallback)? Recommend confirming Argon2id's Vercel-deployability empirically
   before committing to it in this plan's final form.
3. **§4** — Bootstrap temporary password: server-generated and shown once in the Apps Script
   execution log, or owner-supplied via a second Script Property? Both satisfy "no hardcoded
   plaintext"; they have different operational ergonomics.
4. **§9** — Whether to keep MVP-1's historical decision records (D-037 etc.) exactly as-is (recommended,
   matches this project's own convention) or add an explicit "superseded" annotation directly on
   those entries in addition to the new decision this plan will produce.

This plan makes no source, dependency, schema, or test change. It stops here for owner review, per
the change request's explicit instruction.
