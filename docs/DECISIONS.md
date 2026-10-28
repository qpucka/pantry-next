# Decision History

This file records confirmed product and technical decisions. Newer decisions supersede older ones when explicitly marked.

## Product and user experience

### 2026-10-28 — Distinct administrator terminology

Use **Platform Administrator** for the app-wide role and **Organization Administrator** for the organization-scoped role. Avoid the ambiguous term “admin” when referring to permissions. In code and the database, the app-wide role remains represented by `platform_admins`, while the organization role remains the `org_admin` membership role. Staff use the `staff` role, and limited device users use the **Tablet User** term for the `tablet` role. A person may hold Platform Administrator and Organization Administrator permissions independently.

### 2026-10-24 — Simple experience for busy, non-technical users

Setup and daily workflows should minimize steps, jargon, and repeated work while retaining staff assistance as an alternative to self-service.

### 2026-10-24 — Self-service organization registration

Organizations can register without manual approval. Initial registration collects organization name and the first administrator’s email and password. The initial app does not depend on email delivery or verification.

### 2026-10-24 — Organization admins issue staff setup links

Admins create one-time setup links, select the recipient role, and provide links in person. Links expire after 24 hours and can be used once.

### 2026-10-24 — No client-entry retention in the initial waiting-room app

Clearing the queue permanently removes client entries and visit history.

### 2026-10-24 — Queue display and ordering

Appointment clients sort by appointment time and then check-in time. Walk-ins sort by check-in time. Status starts as `checked-in`; shopping clients leave the waiting queue.

### 2026-10-24 — Organization role capabilities

Organization admins can use all organization capabilities. Staff can manage queue operations but not settings or accounts. Tablet-only users have only the tablet capability.

### 2026-10-25 — Tenant-safe live updates

Use authenticated Worker WebSockets and a tenant-scoped Durable Object room. The Worker publishes a small invalidation after a successful database commit; clients refetch authorized state. The database remains authoritative.

## Architecture and security

### 2026-10-26 — React + TypeScript for the browser application

Use React with TypeScript for the browser UI in `apps/web/`. The waiting-room product has multiple role-specific interfaces, shared queue state, realtime updates, authenticated forms, and a roadmap that includes client records, services, appointments, electronic forms, OTP login, and payments. React provides reusable components and predictable UI state management; TypeScript provides static checking as the application and its API contracts grow. Keep the Cloudflare Worker API in `apps/worker/` as a separate application boundary.

### 2026-10-24 — Worker-centric application security

The browser communicates with the Worker, not directly with Postgres for application data. The Worker authenticates users, checks membership and role, derives tenant schema names from trusted records, and performs database operations.

### 2026-10-24 — Shared Supabase project with tenant schemas

Use one Supabase project with a private shared `app` schema and a separate schema per organization. Schema separation is not treated as sufficient authorization; Worker checks and database constraints remain required.

### 2026-10-24 — Password-based authentication for the initial release

Use Supabase Auth for passwords and sessions in the initial waiting-room release. Initial registration does not send email. Account recovery requires human assistance. Email and SMS one-time-passcode login remain later product capabilities.

### 2026-10-24 — Prefer free service tiers initially

Use suitable free tiers during initial development while tracking quotas and retaining a path to paid services or provider migration.

## Infrastructure

### 2026-10-26 — Terraform owns the initial infrastructure graph

Terraform provisions the Supabase project, executes initial setup SQL, creates Hyperdrive after the database role exists, creates the Worker, and deploys the initial Worker version with its bindings and Durable Object migration.

This supersedes the earlier design in which a separate database-setup workflow created Hyperdrive and stored its ID in R2.

### 2026-10-26 — Setup SQL is bootstrap configuration, not migrations

The files in `supabase/setup/` describe the initial database state. Terraform executes them during initial project bootstrap. They are designed to be safely retryable if bootstrap fails or the Terraform resource is recreated; editing them does not automatically rerun completed bootstrap state. They are not an ongoing schema reconciler and do not continuously correct database drift.

### 2026-10-26 — Wrangler owns later application versions

After Terraform establishes the Worker and bindings, the Worker deployment workflow uploads and promotes application versions with Wrangler. Binding inheritance avoids requiring the Hyperdrive ID in the application deployment workflow.

### 2026-10-26 — Worker name belongs to Terraform

Terraform defines the Worker name and exposes it as an output. `apps/worker/wrangler.json` contains Worker packaging and binding configuration but does not duplicate the Worker name. The future React + TypeScript browser application belongs in `apps/web/`.

### 2026-10-27 — Strict TypeScript Worker and Node.js 26 test runtime

The Cloudflare Worker and its tests use TypeScript with strict checking. The Worker package is named `pantrynext-worker`. CI and local Worker tests use Node.js 26; tests run through Node 26’s native TypeScript type-stripping, and the Worker typecheck includes both source and test files. Local database tests use isolated test fixtures rather than production Supabase migrations or setup SQL.

## Product direction beyond the initial release

### 2026-10-18 — Household-centered Pantry product

The broader Pantry product will treat households as the core unit for appointments, services, and food distribution. This is future direction, not a requirement for the initial waiting-room release.

### 2026-10-18 — Appointment booking requires client login

The broader product will allow clients to create accounts, maintain household profiles, and book appointments. The waiting-room release does not yet implement this broader flow.
