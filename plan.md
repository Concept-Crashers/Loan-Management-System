# LendFlow Frontend — Implementation Plan

## Scope and approach

Build a frontend-only React/TypeScript/Vite lending operations console for the Uganda Loan Management System MVP in the supplied blueprint. The deliverable will be a functional, navigable prototype with sample records and client-side demonstration interactions. Backend services, durable financial records, authentication enforcement, authoritative loan calculations, payment allocation, and real integrations are explicitly deferred. The app will expose typed API/service seams so a backend can replace the mock provider later without rewriting page components.

The application will include a responsive authenticated-operations shell and screens for Dashboard; Customers and customer registration/profile; Loan Products; Loan Applications and their review/approval; Active Loans and loan detail; Disbursements; Repayments and record repayment/receipt; Repayment Schedules; Collections; Reports; Transactions; Branches; Staff & Users; Audit Logs; and Settings, alongside Login and Forgot Password. The shell will use the supplied navigation groups and realistic Uganda-oriented sample data (UGX, Ugandan phone formats, MTN/Airtel Money, bank, cash). Tables will support meaningful search/filter/sort affordances; forms and high-value actions will show validation, confirmation, success/error feedback, and appropriate empty/loading states. Key prototype interactions include opening record details, changing relevant UI-only statuses, completing multi-step application and repayment flows, creating records in local mock state, and printing a sample receipt/report. All such state is illustrative and resets with the page; it is not a financial source of truth.

Loan terms and payment allocation must be presented as backend-sourced/illustrative values only. The frontend must not claim to calculate authoritative balances, interest, repayment schedules, allocations, or approval outcomes. Permission-aware UI cues will demonstrate role distinctions without implying real access control. Legal/regulatory applicability remains for the lender's compliance adviser to confirm before production use.

## Implementation architecture

- React + TypeScript + Vite; React Router for route/page composition.
- Bootstrap 5 grid and responsive layout primitives, with shadcn/ui-style accessible controls and composed components; avoid layering competing Bootstrap and Tailwind visual styles.
- Work Sans as the primary font, sourced via CSS font import, with a restrained fintech palette from the blueprint: deep navy `#17365D`, blue `#2563EB`, cool light background `#F8FAFC`, and success/warning/danger semantic colors.
- Lucide React icons (the shadcn icon convention), Recharts for dashboard/report visualizations, React Hook Form + Zod for form state/validation, TanStack Query + Axios-shaped API client boundary, Redux Toolkit for session/navigation-level prototype state as appropriate, date-fns for date formatting, SweetAlert2 for destructive/decision confirmations, and Sonner toast notifications for routine feedback.
- Typed domain models and mock API adapter live separately from feature UI. Use consistent reusable page headers, KPI cards, data tables, status badges, filters, dialogs/sheets, section forms, timeline/activity components, and money/date formatters.
- Include a static `/manus-routes.json` that stays synchronized with the actual route table.
- No managed server or database is enabled during this frontend phase. Later backend work will provide authoritative API behavior and persistence through the typed service boundary.

## Proposed project structure

- `src/app/` — router, app providers, top-level shell, navigation and route guards/placeholders.
- `src/components/` — reusable shadcn-style UI primitives and shared tables, forms, badges, cards and feedback.
- `src/features/dashboard/` — metrics, charts, recent activity and quick actions.
- `src/features/customers/` — customer directory, registration form and profile.
- `src/features/loans/` — product catalogue, application wizard/review, loan accounts/details and disbursement.
- `src/features/repayments/` — payment directory, recording flow, receipts and schedules.
- `src/features/collections/` — follow-up queue, communication history and status actions.
- `src/features/management/` — reports, transactions, branches, staff/roles, audit log and settings.
- `src/data/` — typed sample data and mock provider.
- `src/lib/` — API client seam, formatting, validation helpers and constants.
- `src/styles/` — theme tokens, typography and responsive styling.
- `public/manus-routes.json` — canonical frontend route manifest.

## Design direction

- **Design Movement:** Contemporary fintech operations software: the precision of a modern banking console with approachable, human-centered microfinance cues.
- **Core Principles:** Operational clarity; calm financial trust; progressive disclosure for sensitive/complex records; consistent, auditable action feedback.
- **Color Philosophy:** Deep navy anchors navigation and trust, crisp blue marks primary actions, spacious cool neutrals keep dense records readable, and green/amber/red are reserved for clear financial state semantics.
- **Layout Paradigm:** A persistent, collapsible left rail and compact global header frame a wide, left-aligned work canvas; data tables and detail panels prioritize practical scanning over oversized centered cards.
- **Signature Elements:** Slim blue active-route rail; compact UGX KPI cards with small trend cues; consistent pill-shaped statuses paired with labels (never color alone).
- **Interaction Philosophy:** Keep common actions near their data; use inline search/filtering, confirmation for material decisions, explicit successful/failed feedback, and reviewable steps for multi-part tasks.
- **Animation:** Restrained 120–180 ms fades/slides for menus, dialogs, and page entry; subtle hover/focus transitions; honor reduced-motion preferences and avoid animated financial data.
- **Typography System:** Work Sans throughout. Use clear semibold page/section hierarchy, medium-weight table headers, tabular figures for currency and IDs, and comfortable body copy for forms and customer details.
- **Brand Essence:** A clear operational workspace for Uganda lending teams, connecting borrower care and disciplined loan administration; **grounded, capable, transparent**.
- **Brand Voice:** Direct, respectful, and specific. Examples: “Review the terms before you submit.” “Payment recorded in this demo; final balances come from the lending service.”
- **Wordmark & Logo:** A compact custom “L” ledger-mark concept formed from a navy vertical stroke and a blue rising balance line, beside the LendFlow wordmark.
- **Signature Brand Color:** Deep ledger navy `#17365D`, balanced by action blue `#2563EB`.

## Frontend/backend boundary

All modules will use mock data behind a typed service interface. Prototype forms/actions can update local demo state and demonstrate intended workflows, but the UI will label mock behavior where financial authority matters. API methods will be structured around later service operations (list/get/create/update/decision/record payment/report) and accept server-returned terms, balances, allocations, and permissions. No production credentials, backend, payment gateway, SMS/email delivery, or durable personal data will be added in this phase.
