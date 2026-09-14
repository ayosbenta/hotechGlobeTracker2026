# Project Memory

Updated: 2026-09-14

## Identity

- Project: **Hotech Globe Tracker**
- Owner: Ryan Miranda
- Product: simple Globe Fiber application tracker
- Users: Admin, Agent, Processor
- UI: mobile-first responsive PWA with separate role portals

## Approved stack

- React + TypeScript + Vite
- Tailwind CSS, shadcn/ui, Lucide icons
- Google Sheets database
- Google Apps Script API
- Google Drive for private attachments
- Vercel deployment
- GitHub source control
- Codex implementation

## Approved scope

- Secure login and server-enforced RBAC
- Admin, Agent, and Processor portals
- Application create/view/edit according to role
- Admin assignment of Processor
- Status tracking and history
- Dashboard cards, charts, tables, search, and filters
- Valid-ID uploads to Google Drive
- Activity logs and basic reports
- Responsive installable PWA

## Statuses

`Pending → Transmitted → With Job Order → Ongoing → Installed`

Alternate outcomes: `Delayed`, `Cancelled/Rejected`.

- Delayed and Cancelled/Rejected require a reason.
- Every status change records actor, timestamp, previous/new status, and notes.

## Non-goals for V1

- Commissions, payouts, wallets
- Public referral links or QR tracking
- Complex automation
- Multiple branches
- Native mobile apps

## UI lock

The three PNGs in `design-references/` are the required dashboard direction. Preserve their hierarchy, blue/cyan visual system, card density, tables, charts, spacing, and role-specific menus. Do not substitute a generic admin template.

## Workflow state

- Brainstorming complete for MVP foundation.
- Phase 00 frontend foundation was Owner Approved on 2026-09-13 and is a frozen baseline.
- Foundation includes React + TypeScript + Vite, Tailwind, shadcn-compatible setup, Lucide, React Router, Recharts, PWA shell, typed portal routes, and Admin/Agent/Processor placeholders only.
- Tooling verification passed on 2026-09-13: clean install, formatting, lint, typecheck, 3 unit tests, production build, and Playwright overflow checks at 360, 390, 430, 768, and 1280 px.
- Dashboard reference images remain preserved for Phase 01.
- Phase 01 dashboard UI system was Owner Approved on 2026-09-14. The Admin, Agent, and Processor dashboards are frozen visual baselines; material UI changes require an explicit owner change request.
- Canonical dashboard routes are `/admin/dashboard`, `/agent/dashboard`, and `/processor/dashboard`; their short role routes redirect to the canonical paths.
- Phase 01 verification passed on 2026-09-14: formatting, lint, typecheck, 5 unit tests, production PWA build, and 18 Playwright checks across all role routes at 360, 390, 430, 768, and 1280 px.
- Phase 02 Apps Script and Google Sheets Foundation was Owner Approved on 2026-09-14 and is a frozen backend baseline; future material backend changes require an explicit owner change request.
- Phase 02 adds a typed, test-covered Apps Script foundation: exact Sheet-schema bootstrap, safe JSON envelopes, health-only public routing, UUID/request primitives, lock/version primitives, status-transition configuration, configuration validation, and append-only audit primitives.
- Phase 02 now has a deterministic esbuild Apps Script build: `gas:build` produces an ignored local `apps-script/generated/` directory containing only `Code.js` and `appsscript.json`; `gas:check` validates global entrypoints and artifact safety; `gas:test` runs Apps Script tests plus build/check.
- The generated bundle exposes global `doGet(e)`, `doPost(e)`, and editor-only `bootstrapSchema()` without unresolved modules, Node-only APIs, or source maps. Owner manual verification passed in isolated Apps Script V8: the bootstrap created all seven canonical tabs and exact headers; reruns produced no duplicate tabs/headers; conflicting non-empty headers failed without overwrite. No production resource or Web App deployment was used.
- Phase 02 does not connect the frontend or change the frozen dashboards; it does not implement authentication, sessions, RBAC, CRUD, uploads, Drive access, deployment, or persistent idempotency storage.
- Bootstrap targets only the pre-provisioned Script-Properties Sheet ID and is an Apps Script editor function, not a web endpoint. It is idempotent and rejects conflicting non-empty headers.
- Authentication, caller-based rate limiting, persistent idempotency storage, and CRUD mutation/audit recovery semantics remain deferred decisions for their respective phases. Phase 02 implements only request-ID propagation and reusable idempotency interfaces, with no persistent mutation/retry store.
- Current task is always in `NEXT_TASK.md`.
- Owner approval is required before a phase is marked FINAL.
