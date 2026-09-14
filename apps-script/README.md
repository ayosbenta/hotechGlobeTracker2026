# Apps Script foundation

This folder is the Phase 02 server-side foundation. It is not connected to the React application and no deployment is performed by this phase.

## Configuration and access

Set these Apps Script **Script Properties** in the target project, never in this repository:

- `SPREADSHEET_ID` — required ID of a pre-provisioned Google Sheet.
- `ALLOWED_ORIGINS` — optional comma-separated HTTPS origins. This is a defense-in-depth value only.

`bootstrapSchema()` is an owner-run Apps Script editor function. It creates missing canonical tabs, validates every existing header, and appends a bootstrap audit record only after all tabs exist. It fails rather than overwriting a conflicting non-empty header. It is not a web route.

Apps Script editor access must be tightly restricted: editors can access Script Properties and can alter Sheet/audit rows. “Append-only” is an API behavior, not a transaction or a substitute for Sheet permissions/protections.

## External API

Only `GET /v1/health` is externally callable in Phase 02. It is read-only and non-sensitive. `doPost` returns the standard safe `NOT_FOUND` envelope; there are no CRUD, authentication, upload, migration, repair, or configuration routes.

Apps Script web apps do not reliably provide custom HTTP-status or response-header control. Clients must branch on JSON `ok` and `error.code`, not HTTP status. Origin validation cannot be treated as authentication or authorization; Apps Script event data does not provide a dependable request-header/client-IP security boundary.

## Reproducible build artifact

The local esbuild workflow creates `apps-script/generated/` with exactly:

- `Code.js` — one IIFE bundle with global `doGet(e)`, `doPost(e)`, and `bootstrapSchema()` wrappers.
- `appsscript.json` — V8 Apps Script manifest.

The generated directory is ignored by Git. Rebuild it with `npm run gas:build`; verify it with `npm run gas:check`; or run the Apps Script unit/artifact sequence with `npm run gas:test`. The checker rejects missing global entrypoints, unresolved import/export syntax, Node-only references, source maps, likely credentials, and a public route to bootstrap.

## Non-production Sheet smoke-test procedure

Do not perform this procedure against a production Sheet and do not deploy the web app.

1. Create a pre-provisioned isolated Google Sheet, restrict Sheet and Apps Script editor access, and create/open its bound Apps Script project.
2. In Apps Script Project Settings, add Script Property `SPREADSHEET_ID` with that isolated Sheet's ID. Do not add credentials or production identifiers to repository files.
3. Run `npm run gas:test`, then replace the Apps Script project files with generated `Code.js` and `appsscript.json`. The generated bundle is self-contained; do not upload TypeScript source files.
4. From the Apps Script editor, run `bootstrapSchema()` twice. Do not create a Web App deployment.
5. Confirm precisely one tab each, in this order: `Users`, `Applications`, `Plans`, `Status_History`, `Attachments`, `Activity_Logs`, and `Settings`. Confirm row 1 in each exactly matches the ordered arrays in `core/schema.ts`.
6. In a separate isolated Sheet, create a non-empty `Users` header that differs from the canonical header, point `SPREADSHEET_ID` at it, and run `bootstrapSchema()`. Confirm it fails and does not overwrite that header.

This manual smoke test remains outstanding; Phase 02 has not accessed a real Google Sheet or deployed an Apps Script web app.
