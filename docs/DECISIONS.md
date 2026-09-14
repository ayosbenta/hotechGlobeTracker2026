# Decisions

## Approved

| ID | Date | Decision |
|---|---|---|
| D-001 | 2026-09-13 | Project name is Hotech Globe Tracker. |
| D-002 | 2026-09-13 | V1 is a simple application tracker, not a commission or CRM suite. |
| D-003 | 2026-09-13 | Roles are Admin, Agent, and Processor with separate portals. |
| D-004 | 2026-09-13 | Frontend is React/TypeScript/Vite and deploys to Vercel through GitHub. |
| D-005 | 2026-09-13 | Backend is Google Apps Script with Google Sheets; attachments use Google Drive. |
| D-006 | 2026-09-13 | Supplied Admin, Agent, and Processor dashboard images are the required visual direction. |
| D-007 | 2026-09-13 | Codex work is phased; only owner-approved phases are FINAL. |
| D-008 | 2026-09-13 | Owner approved the Phase 00 Foundation as the frozen implementation baseline. |
| D-009 | 2026-09-14 | Canonical dashboard routes are `/admin/dashboard`, `/agent/dashboard`, and `/processor/dashboard`; the corresponding short role routes redirect to them. |
| D-010 | 2026-09-14 | Owner approved the Phase 01 Admin, Agent, and Processor dashboards as frozen visual baselines. Material changes to their layout, hierarchy, palette, navigation, cards, charts, tables, spacing, or role-specific menus require an explicit owner change request. |
| D-011 | 2026-09-14 | Phase 02 authentication, sessions, and live RBAC are deferred. Its externally callable endpoints are read-only and non-sensitive, and must not trust client actor, role, email, permission, or authorization claims. |
| D-012 | 2026-09-14 | Phase 02 schema bootstrap targets only a pre-provisioned Sheet identified by Script Properties. It is an owner-run Apps Script editor function, is idempotent, rejects conflicting non-empty headers, and is never exposed through `doGet`/`doPost`. |
| D-013 | 2026-09-14 | Phase 02 has server-generated request IDs and reusable idempotency interfaces only. Persistent idempotency/retry storage is deferred until before the first application mutation phase. |
| D-014 | 2026-09-14 | Phase 02 audit primitives are append-only API behavior only, without Google Sheets transaction guarantees. Mutation audit ordering, compensation, and recovery must be designed before CRUD; Sheet and Apps Script editor access must be restricted. |
| D-015 | 2026-09-14 | Phase 02 uses `LockService.getScriptLock()` with a maximum 5-second wait, safe conflict handling, and `finally` release. `Applications.version` primitives are retained without application mutation endpoints. |
| D-016 | 2026-09-14 | Caller-based rate limiting is deferred until authenticated identity/session design. Apps Script client-IP/origin data is not a dependable security boundary. |
| D-017 | 2026-09-14 | The JSON response envelope is authoritative; Apps Script custom HTTP-status and response-header behavior is not relied upon. Safe responses never expose raw errors, stack traces, configuration, Sheet IDs, or Drive IDs. |
| D-018 | 2026-09-14 | The status-transition matrix is server configuration only in Phase 02. Delayed and Cancelled/Rejected require notes; With Job Order and later require job order number; Installed requires installation timestamp. |
| D-019 | 2026-09-14 | Script Properties contain server configuration including the pre-provisioned Sheet ID. Missing or invalid required configuration fails safely; production identifiers and secrets are not committed, and Apps Script editor access must be tightly restricted. |
| D-020 | 2026-09-14 | Phase 02 uses a deterministic local esbuild workflow. It emits an ignored `apps-script/generated/Code.js` and `appsscript.json` artifact, with checks for global entrypoints, unresolved modules, Node-only references, source maps, credentials, and public bootstrap routing. The artifact is reproducible and is not source controlled or deployed in Phase 02. |
| D-021 | 2026-09-14 | Owner approved and froze Phase 02 Apps Script and Google Sheets Foundation. Isolated Apps Script V8 verification passed: generated `Code.js` ran; bootstrap created all seven canonical tabs and exact headers; rerunning created no duplicates; conflicting non-empty headers failed without overwrite. No production resource or Web App deployment was used. Phase 02 retains request-ID/idempotency interfaces only; persistent retry storage remains deferred until before the first mutation phase. |
| D-022 | 2026-09-14 | Phase 03 authentication architecture is Google Identity Services/OpenID Connect only, mediated by a same-origin Vercel BFF. Apps Script remains authoritative. The immutable verified Google `sub` is the external identity; a first bind requires the script lock, one exact normalized-email match to one active pre-provisioned user with a blank subject, and no subject collision. |
| D-023 | 2026-09-14 | Phase 03 sessions use opaque random `__Host-` cookies in the later BFF phase, with 30-minute idle, 8-hour absolute, and 5-minute touch limits. Apps Script stores only secret hashes. Internal requests are audience-bound HMAC requests; one-time durable JTI storage is required for specified sensitive operations in Phase 03B. |
| D-024 | 2026-09-14 | Owner approved and froze Phase 03A Auth Schema and Security Primitives. Isolated Apps Script V8/Google Sheet acceptance confirmed exact append-only Users migration, canonical Sessions/InternalRequestReplays headers, blank-safe defaults only, idempotent rerun, and conflicting-header safe failure with no version advancement. No production resource was used. |

## Open decisions

- Exact Globe plans and current prices
- Whether Processor uses only Admin assignment or may claim from a shared queue
- Authentication method and session duration
- Allowed Agent edits after submission
- Final production domain and Google Workspace ownership

Do not silently decide an open item if it changes business behavior or security.
