# Project Memory

Updated: 2026-09-13

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
- Phase 02 is planned only: establish Google Apps Script and Google Sheets foundations without connecting the frontend or implementing authentication/workflows.
- Current task is always in `NEXT_TASK.md`.
- Owner approval is required before a phase is marked FINAL.
