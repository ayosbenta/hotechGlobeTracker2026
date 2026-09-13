# Handoff

## Goal

Build a polished but simple tracker for Globe Fiber applications. The dashboards must closely match the supplied visual references while remaining responsive and production-ready.

## Architecture

```text
React/Vite PWA on Vercel
        ↓ HTTPS JSON API
Google Apps Script Web App
        ↓
Google Sheets + private Google Drive uploads
```

The browser must never access Sheets directly. Authorization is enforced in Apps Script, not only in React.

## Routes

```text
/login
/admin/dashboard
/admin/applications
/admin/agents
/admin/processors
/admin/reports
/admin/settings
/agent/dashboard
/agent/applications/new
/agent/applications
/agent/plans
/agent/profile
/processor/dashboard
/processor/queue
/processor/assigned
/processor/profile
```

## Portal behavior

- Admin sees all data and manages users, plans, assignments, reports, and settings.
- Agent creates applications and sees only their own records.
- Processor sees the allowed queue and assigned records, then updates processing fields/status.
- Login redirects to the authoritative role portal.
- Unauthorized routes return a safe forbidden state and do not leak data.

## Delivery contract

For each phase:

1. Read `PROJECT_MEMORY.md` and `NEXT_TASK.md` only.
2. Inspect the affected files before editing.
3. Implement only the active phase.
4. Run relevant lint, typecheck, tests, and build.
5. Update `NEXT_TASK.md`, `PROJECT_MEMORY.md`, and `DECISIONS.md` only when truth changed.
6. Report files changed, verification results, blockers, and exact next step.

Do not deploy, push, or mark FINAL without explicit owner instruction.

## Definition of done

- Acceptance criteria for the phase pass.
- No console errors or horizontal overflow at 360, 390, 430, 768, and 1280 px.
- Role permissions are enforced server-side.
- Loading, empty, error, and success states exist.
- No secrets in source control.
- Documentation reflects actual implementation.
