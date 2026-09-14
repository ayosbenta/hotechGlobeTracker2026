# Phase 03B isolated Apps Script acceptance

This procedure is for a fresh, isolated, non-production Sheet only. Do not deploy a Web App, add a production Sheet ID, or enable the harness outside this procedure.

Runtime remediation: Google Apps Script does not provide `Utilities.getRandomBytes()`. The editor suite uses deterministic, non-secret test vectors only; it does not use Apps Script randomness. In production, Phase 03B validates and hashes token/JTI material supplied by the future trusted Phase 03C BFF, which will use Node `crypto.randomBytes()`.

1. Create a fresh Sheet and Apps Script project. Bootstrap the frozen Phase 02 schema, then run `migrateAuthSchemaPhase03A()` once.
2. Add a `Settings` row with `setting_key` `ENVIRONMENT` and `setting_value` `isolated-test`.
3. Build locally with `npm run gas:build` and copy only `apps-script/generated/Code.js` and `appsscript.json` into that isolated project.
4. In Apps Script Script Properties, set these exact names. Replace only angle-bracket placeholders through the Script Properties UI; do not place secrets in source or logs.

| Property                             | Value                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPREADSHEET_ID`                     | `<isolated-sheet-id>`                                                                                                                                                                                                                                                                         |
| `ACCEPTANCE_TEST_SPREADSHEET_ID`     | `<same-isolated-sheet-id>`                                                                                                                                                                                                                                                                    |
| `ACCEPTANCE_TEST_MODE`               | `true`                                                                                                                                                                                                                                                                                        |
| `AUTH_SCHEMA_VERSION`                | `phase-03a-v1`                                                                                                                                                                                                                                                                                |
| `INTERNAL_AUDIENCE`                  | `hotech-globe-tracker.apps-script.nonprod`                                                                                                                                                                                                                                                    |
| `INTERNAL_HMAC_ACTIVE_KEY_ID`        | `nonprod-k1`                                                                                                                                                                                                                                                                                  |
| `INTERNAL_HMAC_KEYS_JSON`            | `{"nonprod-k1":{"secret":"<independent-32-byte-base64url-hmac-secret>","status":"active"},"nonprod-k2":{"secret":"<independent-32-byte-base64url-retiring-secret>","status":"retiring"},"nonprod-disabled":{"secret":"<independent-32-byte-base64url-disabled-secret>","status":"disabled"}}` |
| `SESSION_TOKEN_PEPPER`               | `<independent-32-byte-base64url-session-pepper>`                                                                                                                                                                                                                                              |
| `CSRF_TOKEN_PEPPER`                  | `<independent-32-byte-base64url-csrf-pepper>`                                                                                                                                                                                                                                                 |
| `INTERNAL_CLOCK_SKEW_SECONDS`        | `30`                                                                                                                                                                                                                                                                                          |
| `INTERNAL_ASSERTION_MAX_TTL_SECONDS` | `60`                                                                                                                                                                                                                                                                                          |
| `SESSION_IDLE_TTL_SECONDS`           | `1800`                                                                                                                                                                                                                                                                                        |
| `SESSION_ABSOLUTE_TTL_SECONDS`       | `28800`                                                                                                                                                                                                                                                                                       |
| `SESSION_TOUCH_INTERVAL_SECONDS`     | `300`                                                                                                                                                                                                                                                                                         |

Leave `ALLOWED_ORIGINS`, `PRODUCTION_ORIGIN`, `PRODUCTION_DOMAIN`, `VERCEL_URL`, and `PUBLIC_APP_ORIGIN` unset. The harness fails closed if any is configured.

Generate each secret independently, without printing it after assignment:

```powershell
$env:PHASE03B_HMAC = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
$env:PHASE03B_SESSION_PEPPER = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
$env:PHASE03B_CSRF_PEPPER = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
# Transfer each value only into the isolated Apps Script Script Properties UI.
Remove-Item Env:PHASE03B_HMAC,Env:PHASE03B_SESSION_PEPPER,Env:PHASE03B_CSRF_PEPPER
```

5. From the Apps Script editor, run `runPhase03BAcceptanceSuite()`. Review only its sanitized summary: it must show `ok: true`, zero failures, and `cleanup: true`. Do not copy raw execution data into notes.
6. If cleanup is false or the suite throws, run `cleanupPhase03BAcceptanceData()` from the editor. If that fails, in the isolated Sheet only, delete rows whose first column starts exactly with `__phase03b_test__` from `Users`, `Sessions`, `InternalRequestReplays`, and `Activity_Logs`. Preserve row 1 headers and every other row. Do not remove `phase03b_test`, `user_phase03b_test`, `__phase03b_test`, or `phase03b_test__` rows.
7. Confirm the four tabs contain no remaining `__phase03b_test__` records. Remove `ACCEPTANCE_TEST_MODE` and `ACCEPTANCE_TEST_SPREADSHEET_ID` from Script Properties. Keep the Sheet isolated; do not deploy it.
