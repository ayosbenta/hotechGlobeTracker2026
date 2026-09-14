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

## Open decisions

- Exact Globe plans and current prices
- Whether Processor uses only Admin assignment or may claim from a shared queue
- Authentication method and session duration
- Allowed Agent edits after submission
- Final production domain and Google Workspace ownership

Do not silently decide an open item if it changes business behavior or security.
