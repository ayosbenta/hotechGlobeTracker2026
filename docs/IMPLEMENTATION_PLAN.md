# Implementation Plan

Work one phase at a time. Do not pre-build later phases.

## Phase 00 — Foundation

- React/Vite/TypeScript project
- Tailwind, shadcn/ui, Lucide
- ESLint, formatting, tests, Playwright
- PWA manifest and base responsive shell
- Environment validation and README

## Phase 01 — UI system and dashboards

- Tokens, typography, sidebar, header, cards, tables, charts
- Admin, Agent, Processor dashboard routes using typed mock data
- Match the three reference PNGs
- Responsive and visual QA

## Phase 02 — Apps Script and Sheets foundation

- Sheet schema/bootstrap script
- Versioned JSON response envelope
- Validation, error handling, audit utilities
- Repository/API adapters so UI is not coupled to Sheets

## Phase 03 — Authentication and RBAC

- Login/session lifecycle
- Role redirects and route guards
- Server-side authorization on every operation
- Account activation/deactivation and security logs

## Phase 04 — Applications

- Admin/Agent creation flow
- Lists, details, filters, search
- Role-limited editing
- Duplicate/idempotency safeguards

## Phase 05 — Processing workflow

- Admin assignment
- Processor queue and assigned records
- Valid status transitions, notes, Job Order, installation date
- Immutable status history

## Phase 06 — Plans, users, attachments

- Admin user and plan management
- Private Google Drive uploads
- Authorized attachment access

## Phase 07 — Reports and finishing

- Dashboard live metrics and charts
- Role-appropriate reports and CSV export
- PWA/offline-safe shell, accessibility, performance
- Full regression, GitHub/Vercel handoff

## Phase gates

Every phase requires documented verification. Owner approval freezes a phase; later changes become explicit change requests.
