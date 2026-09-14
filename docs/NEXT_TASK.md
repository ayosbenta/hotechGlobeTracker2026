# Next Task — Phase 03B: Apps Script Auth and Session Domain

Previous phase: **Phase 03A Auth Schema and Security Primitives — Owner Approved and frozen (2026-09-14).**

Status: **Prepared only. Do not implement until separately instructed by the owner.**

## Objective

Implement the Apps Script-only authoritative authentication/session domain behind verified Vercel internal requests. Do not add browser, GIS, BFF, public authentication routes, deployment, or dashboard changes.

## Internal signed-request contract

Each internal request has exactly these security fields plus an operation-specific `payload` object:

```text
version, key_id, audience, issued_at, expires_at, jti, method, path, body_digest, signature, payload
```

- `version`: exactly `v1`; `key_id`: configured active key ID; `audience`: exact configured Apps Script audience.
- `issued_at` and `expires_at`: RFC 3339 UTC with trailing `Z`; `jti`: opaque random, never stored/logged raw.
- `method`: uppercase ASCII; `path`: exact normalized leading-slash route, without query/fragment.
- `body_digest`: base64url SHA-256 of canonical JSON UTF-8 `payload`; `signature`: base64url HMAC-SHA-256 of the canonical input.
- Canonical signing input is the following UTF-8, newline-joined text with no trailing newline:

```text
v1
{key_id}
{audience}
{issued_at}
{expires_at}
{jti}
{method}
{path}
{body_digest}
```

- Canonical JSON recursively sorts object keys, permits JSON primitives only, has no insignificant whitespace, rejects duplicate keys/non-finite numbers, and is digest-checked before any domain action. Signature comparison is constant-time.

## Key rotation, time, and replay rules

- Configuration supplies a key ring: one current active key and zero or more explicitly active retiring keys, indexed by unique `key_id`. Unknown, disabled, or duplicate IDs fail closed; there is no fallback to another key.
- `expires_at` must be later than `issued_at` and at most 300 seconds later. Reject issued times over 300 seconds future, expiry over 300 seconds past, and all malformed/wrong version/audience/method/path/digest/signature input.
- Login, logout, session creation, session rotation, and every unsafe operation require a JTI. Read-only requests require a valid envelope but create no replay row.
- Under the script lock: hash JTI, reject an existing `InternalRequestReplays.jti_hash`, then append one replay row with only hash, purpose, digest, times, and available IDs. Retain consumed JTI if later work fails: fail closed, no silent reuse or rollback claim.

## Session, identity, and authorization domain

- Generate session/CSRF secrets via injected secure randomness. Return raw values only through the later authenticated internal contract when needed; never store/log/audit them. Store only hashes in `Sessions`.
- Create sessions under lock with server ID, authoritative user ID/current session version, issued/last-seen timestamps, 30-minute idle expiry, 8-hour absolute expiry, and CSRF hash.
- On validation, reload Users and require `account_status === "Active"`, a supported role, matching session version, unrevoked session, and unexpired idle/absolute limits. Browser/BFF IDs, role, email, and permissions are never authoritative.
- Touch at most every 300 seconds and never beyond absolute expiry. Rotate by revoking old then creating replacement under one lock. Logout/revocation marks the session revoked; version changes invalidate older sessions.
- First bind is under lock after verified Google identity input: allow only verified email matching exactly one active pre-provisioned Users row with blank `provider_subject`, and no row bound to the candidate immutable `sub`. Re-read immediately before write; otherwise generic safe denial.
- Unsafe session operations validate a CSRF value by constant-time hash comparison with the session record.

## Audit, ordering, and safe failures

- Emit security/audit events for successful session creation, rotation, logout/revocation, first binding, and denials where an authoritative user/session exists. Store IDs, purpose/result, request ID, and times only—never raw secrets, tokens, JTI, assertions, email, or signatures.
- Unsafe ordering: validate config/envelope; acquire lock; consume replay; reload authoritative state; validate CSRF/session/account/role; minimal domain write; append audit/security event. Failure after replay consumption leaves it consumed; failure before consumption changes nothing. No cross-sheet transaction or destructive rollback claim.

## Included

- Apps Script envelope parser/canonicalizer, HMAC key-ring verification, clock validation, replay repository/consumption, live session domain, authoritative role/account checks, first-bind transaction, CSRF, security/audit events, configuration validation, and injected-adapter tests.
- Isolated non-production Google Sheet/Apps Script acceptance testing.

## Excluded

- Public `doGet`/`doPost` auth routes, GIS token verification, Vercel BFF, browser cookies/headers, frontend login/guards, dashboard changes, CRUD, uploads, Drive, reporting, production resources, deployment, push, or release.

## Isolated acceptance plan

1. Use a fresh non-production Sheet with the Owner Approved Phase 03A schema and isolated key ring.
2. Test correct/incorrect key IDs, signatures, audience, digest, timestamp, expiry, and skew; test key rotation and no-fallback behavior.
3. Test one-time JTI consumption, duplicate rejection, read-only no-row behavior, retention, and downstream-failure fail-closed behavior.
4. Test hash-only session storage, touch throttling, idle/absolute expiry, rotation, revocation, version/account/role denial, and CSRF rejection.
5. Test first-bind success plus duplicate email/subject races, inactive/unverified/non-matching denial under lock; confirm audit records contain no secrets.
6. Run formatting, lint, typecheck, all unit tests, Apps Script artifact build/check, production frontend build, dashboard Playwright regression, credential scan, and Git diff check.

Approval state: **Planned — awaiting owner instruction.**
