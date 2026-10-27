# Manual Setup

Complete these steps before running the automated GitHub Actions workflows.

## 1. Cloudflare account

Create or select the Cloudflare account that will own the R2 state bucket, Hyperdrive configuration, and Worker. Record its account ID.

Add this GitHub environment variable:

- `CLOUDFLARE_ACCOUNT_ID`

## 2. Cloudflare R2 Terraform backend

Create a private R2 bucket for Terraform state. Create S3-compatible credentials with access to that bucket.

Add these secrets to the GitHub Actions environment named `terraform`:

- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`

Add these variables to the same environment:

- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_R2_ENDPOINT`

The endpoint must be the R2 S3 API endpoint for the Cloudflare account.

## 3. Cloudflare API token

Create a Cloudflare API token for the account. It must be able to manage the Cloudflare resources used by this repository:

- Hyperdrive configurations
- Workers and Worker versions/deployments

Add it as this GitHub environment secret:

- `CLOUDFLARE_API_TOKEN`

## 4. Supabase organization and project settings

Create or select the Supabase organization that will own the project.

Add these GitHub environment variables:

- `SUPABASE_ORG_ID`
- `SUPABASE_PROJECT_NAME`
- `SUPABASE_REGION`

## 5. Supabase access and database passwords

Create a Supabase personal access token with access for the Supabase Terraform provider and CLI. Add it as:

- `SUPABASE_ACCESS_TOKEN`

Choose a strong administrator password for the Supabase project and add it as:

- `SUPABASE_DB_PASSWORD`

Generate a separate strong password for the Hyperdrive database role, for example:

```bash
openssl rand -hex 32
```

Add the result as:

- `HYPERDRIVE_DB_PASSWORD`

`SUPABASE_DB_PASSWORD` creates the Supabase project. `HYPERDRIVE_DB_PASSWORD` is applied by the setup SQL to `cloudflare_hyperdrive_role` and supplied to Hyperdrive.

## 6. GitHub Actions environment

Create a GitHub Actions environment named `terraform`. Add all secrets and variables listed above to that environment.

Ensure the default branch contains:

- `.github/workflows/00-terraform-apply.yml`
- `.github/workflows/01-worker-deploy.yml`
- `infra/terraform/`
- `supabase/setup/`
- `apps/worker/`

After these prerequisites are configured, run `00-terraform-apply` to provision the initial infrastructure. Later application deployments use `01-worker-deploy`.
