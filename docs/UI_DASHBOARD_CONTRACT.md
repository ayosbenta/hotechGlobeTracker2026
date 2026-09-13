# Dashboard UI Contract

These references are the visual baseline:

- Admin: `../design-references/admin-dashboard.png`
- Agent: `../design-references/agent-dashboard.png`
- Processor: `../design-references/processor-dashboard.png`

## Shared design system

- Desktop: fixed blue gradient sidebar, white/light-blue canvas, slim top header.
- Mobile: sidebar becomes a drawer; tables become usable cards or horizontally contained views.
- Typography: clean sans-serif, dark navy headings, restrained secondary text.
- Surfaces: white cards, subtle blue-gray borders, soft shadows, 12–16 px radius.
- Accent: royal blue/cyan. Status colors: amber Pending, blue Job Order/Ongoing, green Installed, red Cancelled/Rejected.
- Dense enough for operations, but with consistent spacing and strong hierarchy.
- Use Lucide icons; do not mix icon styles.
- Every screen includes skeleton/loading, empty, error, and populated states.

## Admin dashboard — required composition

- Sidebar: Dashboard, Applications, Agents, Processors, Reports, Settings.
- Header: greeting, global search, notification indicator, profile menu.
- First row: Total Applications, Pending, With Job Order, Ongoing, Installed.
- Second row: Monthly Applications line chart and Application Status donut chart.
- Bottom: Recent Applications table with Customer, Address, Agent, Processor, Status, Date, Actions.
- Include filters without crowding the dashboard.

## Agent dashboard — required composition

- Sidebar: Dashboard, New Application, My Applications, Globe Plans, Profile.
- Prominent `Add New Application` action.
- Cards: My Applications, Pending, Ongoing, Installed, Cancelled.
- Application Progress chart and My Applications trend.
- Recent Submissions table.
- Never show global users, reports, or admin controls.

## Processor dashboard — required composition

- Sidebar: Dashboard, Application Queue, My Assigned, Profile.
- Cards: Assigned Applications, For Processing, With Job Order, Ongoing, Installed.
- Main focus: Priority Queue table with a clear `View Application` action.
- Secondary: personal processing-productivity chart and quick stats.
- Never show user management or settings.

## Responsive acceptance

- No horizontal page overflow at 360/390/430/768/1280 px.
- Desktop composition remains visually close to the PNG references.
- At small widths, key actions remain visible without excessive scrolling.
- Charts resize safely; labels remain legible.
- Touch targets are at least 44 px.

## Change control

These references are approved direction, not optional inspiration. Material changes to navigation, palette, card order, information hierarchy, or dashboard composition require owner approval and a new entry in `DECISIONS.md`.
