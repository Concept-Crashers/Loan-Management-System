# LendFlow — Frontend and Repository Synchronization Plan

## Scope and approach

Build and maintain a frontend-first React/TypeScript/Vite lending operations console for the Uganda Loan Management System MVP in the supplied blueprint. The active frontend is now the user's newer GitHub implementation under `frontend/`; it adds an API-backed service boundary, authentication/session flow, offline queue, accounting, audit, imports/documents/activity and enterprise operations. The GitHub repository also includes an Express/Mongoose backend source tree under `backend/`.

Synchronize the Manus project's canonical `main` and `https://github.com/Concept-Crashers/Loan-Management-System` `main` without force-pushing or rewriting either history. Their starting histories are unrelated, so preserve both with a two-parent merge. Keep the imported monorepo paths (`frontend/`, `backend/`) as the shared source structure, and make the existing Manus Preview run the `frontend` workspace package. Preserve the previous root-based Manus frontend in Git history and carry forward its relevant safeguards and user requirements, especially Work Sans, role-aware approval controls, repayment-balance guards, and the completed settings styling.

The backend source is included because it is already part of the user's repository. Do not start or enable Manus-managed server/database services in this sync. Do not configure credentials or make the browser authoritative for balances, interest, schedules, allocations, or approval decisions. Any API behavior remains subject to the user's own backend configuration and access controls; confirm regulatory applicability with the lender's compliance adviser before production use.

## Product and interaction scope

The interface includes a responsive operations shell and routes for Dashboard; Customers and registration/profile; Loan Products; Loan Applications and approval review; Active Loans; Disbursements; Repayments and receipts; Repayment Schedules; Collections; Reports; Transactions; Branches; Staff & Users; Audit Logs; Settings; Profile & Security; Documents; Imports; Activity; Enterprise Operations; Accounting; Login; and Forgot Password. Use Uganda-oriented UX: UGX, Ugandan phone formats, MTN/Airtel Money, bank transfer and cash. Preserve meaningful search/filtering, confirmations, success/error feedback, loading/empty/error states and permission distinctions.

All figures and user-impacting decisions remain backend-sourced or explicitly illustrative. Roles and sensitive data must remain permission-aware; UI-only controls are not security enforcement. The frontend must never claim that a browser-side balance, interest calculation, payment allocation, decision or record is authoritative.

## Implementation architecture

- React + TypeScript + Vite, with React Router for the route tree.
- Bootstrap 5 grid and responsive layout primitives with shadcn/ui-style accessible components; avoid competing styling systems.
- Work Sans as the primary font, sourced in `frontend/index.html` and used throughout the stylesheet. Use deep navy `#17365D`, action blue `#2563EB`, cool light backgrounds and semantic status colors.
- Lucide React icons, Recharts, React Hook Form + Zod, TanStack Query, Axios-shaped API client boundary, Redux Toolkit, date-fns, SweetAlert2 and Sonner toast notifications.
- Typed domain/API models, backend-facing service adapters and offline queue live under `frontend/src/lib/`; feature components remain separated by domain.
- The root pnpm workspace exposes `dev`, `build` and `preview` scripts forwarding to the frontend package, which listens on the configured Preview port 3000.
- Keep `frontend/public/manus-routes.json` synchronized with every actual page route. Preserve the project-root `app.config.ts` HTTPS `logoUrl` for Manus project branding.
- The `backend/` source is synchronized but Manus `features.server` and `features.database` remain disabled; this task does not start the service or deploy it.

## Project structure

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` — root workspace and Preview/build forwarding scripts.
- `frontend/` — the active React/Vite application and its own HTML, Vite/TypeScript config, assets, route manifest, page routes, shared components, domain features, API/service boundary, offline queue and Work Sans design system.
- `backend/` — the user's existing Express/Mongoose service source, API routes, domain modules, tests and deployment/container definitions; source is preserved but not enabled by Manus in this phase.
- `docker-compose.yml`, `README.md`, `USER_GUIDE.md` — repository-level development/deployment documentation from the user's repository.
- `app.config.ts` — root-level Manus project branding metadata; keep its durable quoted HTTPS logo URL.
- `plan.md`, `TODO.md` — this synchronized implementation plan and the full original MVP acceptance clauses plus repository-sync outcome.

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
- **Brand Voice:** Direct, respectful, and specific. Examples: “Review the terms before you submit.” “Payment recorded; final balances come from the lending service.”
- **Wordmark & Logo:** A compact custom “L” ledger-mark concept formed from a navy vertical stroke and a blue rising balance line, beside the LendFlow wordmark.
- **Signature Brand Color:** Deep ledger navy `#17365D`, balanced by action blue `#2563EB`.

## Frontend/backend boundary

The frontend consumes the user's backend through the typed API/service boundary and can use `VITE_API_URL` for environment-specific service routing. The corresponding backend source is included in the synchronized repository, but this Manus project keeps its managed server/database features off. Before relying on the API, verify the configured endpoint, authorization, privacy, business rules and applicable compliance requirements. Browser UI guards are advisory only; the backend must enforce access control, transaction integrity, authoritative financial calculations and audit history.
