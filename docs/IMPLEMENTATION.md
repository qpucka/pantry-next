# Implementation and Stack

## Architecture

```text
Browser
  ↓
Cloudflare Worker
  ├── Supabase Auth HTTP API
  ├── Hyperdrive → Supabase Postgres
  └── Durable Object room per organization
```

The Worker is the application boundary. It authenticates requests, checks organization membership and roles, derives trusted tenant schema names, performs database operations, and serves the browser assets.

Postgres is the source of truth. Durable Objects provide tenant-scoped realtime notification rooms; they do not replace database reads or store authoritative queue state.

## Stack

- **Cloudflare Workers:** application runtime and static asset delivery.
- **Wrangler:** application bundling, version upload, and version deployment.
- **Cloudflare Hyperdrive:** Worker-to-Postgres connectivity.
- **Cloudflare Durable Objects:** organization-scoped WebSocket notification rooms.
- **Supabase:** Postgres database, Auth API, and project management.
- **Terraform:** Supabase project, initial database bootstrap execution, Hyperdrive, Worker, initial Worker version, bindings, and first Durable Object migration.
- **GitHub Actions:** Terraform provisioning and later application deployments.
- **JavaScript:** Worker application code; this is not a React or TypeScript application.

## Repository responsibilities

### `apps/worker/`

- `src/index.js`: Worker entrypoint, routing, authentication, authorization, and API handlers.
- `src/database.js`: database operations and tenant schema provisioning.
- `src/queue.js`: queue behavior and role-aware operations.
- `src/realtime.js`: Durable Object implementation and change notifications.
- `public/`: static browser assets.
- `wrangler.json`: application bundling, assets, Durable Object binding, and migration configuration.
- `test/`: Worker and database behavior tests.

### `apps/web/`

Reserved for the React + TypeScript browser application. Its build output will be served by the Worker as static assets.

### `supabase/setup/`

One-time initial database bootstrap SQL:

1. `00-create-schema.sql`: shared `app` schema and registry tables.
2. `01-create-hyperdrive-role.sql`: Hyperdrive login and password.
3. `02-grants.sql`: database, schema, and table privileges.

These scripts are bootstrap configuration, not migration history. Terraform executes them after creating the Supabase project. They are idempotent for retries, but SQL edits do not automatically rerun the completed Terraform bootstrap resource.

### `infra/terraform/`

- `supabase.tf`: Supabase project, bootstrap SQL execution, API-key outputs, and project outputs.
- `cloudflare.tf`: Hyperdrive, Worker, initial Worker version, bindings, Durable Object migration, and Worker outputs.
- `state.tf`: Terraform state in Cloudflare R2 through the S3-compatible backend.
- `variables.tf`: environment-provided identifiers and passwords.
- `versions.tf`: Terraform and provider constraints.

## Infrastructure lifecycle

The `00-terraform-apply` workflow performs one dependency-ordered apply:

1. Create or reconcile the Supabase project.
2. Run the initial setup SQL.
3. Create Hyperdrive using `cloudflare_hyperdrive_role`.
4. Create the Worker.
5. Upload and deploy the initial Worker version with Hyperdrive and `ORG_REALTIME` bindings.
6. Apply the initial `OrganizationRealtimeRoom` Durable Object migration.

The Hyperdrive ID is kept in Terraform state. It is not copied to R2 as a separate artifact.

## Application deployment lifecycle

The `01-worker-deploy` workflow:

1. Reads the Worker name and Supabase public settings from Terraform state.
2. Installs `apps/worker` dependencies with `npm ci`.
3. Uses `wrangler versions upload` to upload the application code.
4. Relies on Wrangler’s strict binding inheritance to preserve the existing Hyperdrive binding without knowing its ID.
5. Uses `wrangler versions deploy` to route 100% of traffic to the uploaded version.

Terraform owns infrastructure. Wrangler owns later application-code versions. The two workflows are serialized through the shared concurrency group.

## Database and tenant boundary

The private shared `app` schema contains organizations, memberships, platform admins, and setup-link records. Each organization receives a separate schema derived from its trusted registry UUID. The Worker never accepts a schema name from the browser.

The runtime database role can access the application’s tenant data and may create tenant schemas as required by registration. Worker authorization and Postgres constraints protect tenant behavior; schema separation alone is not treated as an authorization boundary.

## Security boundaries

- Keep credentials in GitHub environment secrets, never source control.
- Use the Hyperdrive role rather than the Supabase administrator password for Worker database access.
- Use HttpOnly, Secure session cookies.
- Validate organization membership and role on every protected operation.
- Treat realtime messages as invalidation signals, not trusted data.
- Test cross-organization access, role restrictions, CSRF behavior, and TV credential limitations.
