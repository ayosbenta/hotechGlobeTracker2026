# Next Task — Phase 02 Apps Script and Google Sheets Foundation

Previous phase: **Phase 01 UI System and Dashboards — Owner Approved (2026-09-14).** The three role dashboards are frozen visual baselines; material UI changes require an explicit owner change request.

Status: **Not started**

## Objective

Create the server-side Google Apps Script and Google Sheets foundation with typed contracts, schema setup, validation, locking, and audit primitives. Do not connect the React frontend, deploy the web app, or implement authentication or full application workflows.

## Proposed Google Sheets tabs and exact columns

All tabs use row 1 headers, ISO-8601 UTC timestamps, and server-generated UUIDs. UUIDs—not row numbers—are the only persistent record identities.

| Tab | Exact columns |
|---|---|
| `Users` | `user_id`, `email`, `full_name`, `mobile_number`, `role`, `account_status`, `created_at`, `updated_at` |
| `Applications` | `application_id`, `customer_full_name`, `mobile_number`, `email`, `complete_address`, `barangay`, `city_municipality`, `province`, `landmark`, `plan_id`, `plan_name_snapshot`, `monthly_price_snapshot`, `agent_id`, `processor_id`, `current_status`, `job_order_number`, `submitted_at`, `installed_at`, `notes`, `version`, `created_at`, `updated_at` |
| `Plans` | `plan_id`, `plan_name`, `monthly_price`, `speed_mbps`, `plan_status`, `created_at`, `updated_at` |
| `Status_History` | `history_id`, `application_id`, `from_status`, `to_status`, `notes`, `job_order_number`, `actor_user_id`, `request_id`, `occurred_at` |
| `Attachments` | `attachment_id`, `application_id`, `id_type`, `side`, `drive_file_id`, `original_filename`, `mime_type`, `size_bytes`, `uploaded_by_user_id`, `created_at`, `deleted_at` |
| `Activity_Logs` | `log_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata_json`, `occurred_at` |
| `Settings` | `setting_key`, `setting_value`, `updated_by_user_id`, `updated_at` |

## Apps Script API structure

- One Apps Script Web App entrypoint using `doGet(e)` and `doPost(e)`, routing on a versioned `e.pathInfo` such as `/v1/health`, `/v1/applications`, and `/v1/applications/{applicationId}`.
- Separate typed modules for routing, request parsing, validation, authorization policy, repository adapters, status-transition rules, response serialization, and audit logging.
- Phase 02 implements schema/bootstrap and health/foundation operations only. CRUD, uploads, login/session issuance, dashboard data replacement, and frontend connection remain later work.
- Authorization hooks accept an authenticated actor contract but do not select an authentication provider; the authentication method remains an open owner decision.

## Response and error envelope

Successful responses:

```json
{
  "ok": true,
  "requestId": "uuid",
  "data": {},
  "meta": { "timestamp": "ISO-8601", "nextCursor": null }
}
```

Safe failures:

```json
{
  "ok": false,
  "requestId": "uuid",
  "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed.", "details": [] }
}
```

Error codes include `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, and `INTERNAL_ERROR`. Public responses never include stack traces, Sheet identifiers, Drive identifiers, or raw exception text.

## UUID, concurrency, and audit strategy

- Generate UUIDs only on the server with `Utilities.getUuid()` for every primary key and `request_id`; reject client-supplied identity fields for creates.
- Use `LockService.getScriptLock()` around all multi-row writes. Acquire with a bounded wait, return `CONFLICT` on contention, and release in `finally`.
- Enforce optimistic concurrency with `Applications.version`: updates must supply the current version, then atomically increment it while holding the script lock.
- Append immutable `Status_History` rows for every status transition and immutable `Activity_Logs` rows for important reads, mutations, authorization failures, and bootstrap operations. Include actor, entity, action, request ID, UTC timestamp, and JSON metadata without secrets or public Drive URLs.

## Environment and secret handling

- Store Sheet ID, Drive folder IDs, allowed origins, and server-only configuration exclusively in Apps Script Script Properties; never commit them or expose them in JSON responses.
- Keep browser configuration public and minimal in `.env.example`; it may later contain a public API base URL but no credentials, OAuth secrets, service-account material, or Sheet/Drive IDs.
- Provide a startup configuration validator that fails safely with a generic server error when required Script Properties are absent or malformed.

## Test strategy

- Unit-test pure schema, validation, response-envelope, status-transition, UUID, and authorization-policy modules locally with deterministic clock/UUID adapters.
- Test repository adapters with mocked Spreadsheet, LockService, PropertiesService, and Session/actor dependencies; cover lock contention, stale versions, duplicate request IDs, malformed payloads, and audit append failures.
- Add an Apps Script smoke-test runner for an isolated development spreadsheet that verifies headers, idempotent schema initialization, and no row-number identity assumptions.
- Before any frontend connection, run the existing frontend quality suite unchanged and manually verify the health/foundation API only after a separately approved deployment step.

## Excluded

- Frontend API connection, dashboard mock-data replacement, or changes to the frozen dashboards.
- Authentication provider selection, login/session implementation, live RBAC, CRUD workflows, uploads, Drive access, reports, and production deployment.
- GitHub push or deployment.

## Acceptance criteria

- Schema bootstrap creates or validates exactly the documented tab headers without using row numbers as IDs.
- All foundation responses follow the documented safe envelope and do not expose configuration or internal exceptions.
- UUID, lock, optimistic-version, and immutable-audit primitives are covered by tests.
- No secrets are committed; lint, typecheck, tests, and build pass for changed code.

Approval state: In Progress
