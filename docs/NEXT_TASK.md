# Next Task — Phase 01 UI System and Dashboards

Previous phase: **Phase 00 Foundation — Owner Approved (2026-09-13).** It is a frozen baseline.

Status: **Not started**

## Objective

Implement the approved dashboard UI system and populated mock dashboards for Admin, Agent, and Processor. Match the supplied reference images closely while retaining the Phase 00 foundation.

## Required visual references

- `design-references/admin-dashboard.png`
- `design-references/agent-dashboard.png`
- `design-references/processor-dashboard.png`

These are required direction, not generic inspiration. Preserve their layout hierarchy, blue/cyan visual system, sidebar structure, card density, charts, tables, spacing, and role-specific menus.

## Proposed component structure

- `dashboard-shell`: desktop gradient sidebar, slim top header, mobile drawer, search, notifications, and profile affordances.
- `role-navigation`: role-owned menus and active states; no Admin controls in Agent or Processor portals.
- `dashboard-page`: shared responsive canvas, greeting/context header, and ordered content regions.
- `metric-card` and `status-badge`: shared icon/color/label/value treatments for operational KPI cards.
- `chart-card`: responsive Recharts line, donut, and bar wrappers with legends, empty/loading/error states, and mock data adapters.
- `data-table-card`: filter/search toolbar, contained desktop table, mobile card/list presentation, status pills, and action affordances.
- `dashboard-states`: skeleton, empty, and error variants for every dashboard region.

## Routes included

- `/admin` — five application KPI cards, monthly line chart, status donut, and recent-applications table; menu: Dashboard, Applications, Agents, Processors, Reports, Settings.
- `/agent` — prominent Add New Application action, five personal KPI cards, progress donut, submission trend chart, and recent-submissions table; menu: Dashboard, New Application, My Applications, Globe Plans, Profile.
- `/processor` — five workload KPI cards, priority queue, productivity bar chart, and quick stats; menu: Dashboard, Application Queue, My Assigned, Profile.

Route paths remain Phase 00 paths. Navigation destinations beyond these dashboard routes remain non-functional visual placeholders until their assigned phases.

## Responsive strategy

- At `lg` and above, use the reference-like fixed sidebar and multi-column dashboard grids.
- At `md`, preserve information order while reducing chart/table columns and wrapping filters safely.
- At 360/390/430 px, use the existing drawer navigation, full-width KPI cards, one-column chart regions, 44 px controls, and contained horizontal table areas or accessible stacked data cards.
- Ensure charts use responsive containers; keep legends readable and essential actions visible without horizontal page overflow.

## Visual verification plan

- Compare rendered Admin, Agent, and Processor pages against all three supplied PNGs at desktop width for navigation, card order, chart/table placement, spacing, palette, and menu specificity.
- Run Playwright at 360, 390, 430, 768, and 1280 px for all three role routes; assert no horizontal page overflow, visible primary actions, and usable navigation.
- Add component/unit coverage for role navigation and key dashboard states; run lint, typecheck, unit tests, Playwright, and production build.

## Excluded

- Authentication and server-enforced RBAC implementation.
- Google Apps Script, Sheets, Drive, and any live API connection.
- Application create/edit/detail workflows, actual search/filter behavior, uploads, reports, or user management.
- Deployment or GitHub push.

## Acceptance criteria

- All three dashboard compositions are visually faithful to the approved references at desktop width.
- Role menus and visible controls remain distinct and match the approved information hierarchy.
- Every dashboard region provides populated mock, loading, empty, and error states.
- No horizontal page overflow at 360, 390, 430, 768, or 1280 px.
- Lint, typecheck, tests, Playwright, and production build pass.

Approval state: In Progress
