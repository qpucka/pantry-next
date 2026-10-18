# Manual Project Setup

This checklist tracks the initial infrastructure setup for running Terraform from GitHub Actions. It records manual dashboard steps and decisions; do not put credential values in this file.

## Current status

- [x] Create the GitHub repository.
- [x] Create a Cloudflare API token for the staging environment, scoped to the account with `Workers Scripts: Edit`.
- [x] Create a Supabase personal access token for the staging environment, scoped to the intended organization with `Full Access`.
- [x] Add provider tokens and R2 credentials to the GitHub repository's `staging` environment as Actions secrets. Current secret names:
  - `CF_TOKEN` — Cloudflare API token for the provider (`Workers Scripts: Edit`).
  - `SB_TOKEN` — Supabase personal access token for the provider.
  - `CF_R2_ACCESS_ID` — R2 S3-compatible backend access key ID.
  - `CF_R2_SECRET_ACCESS_KEY` — R2 S3-compatible backend secret access key.
  - `CF_R2_TOKEN` — also added by the user; if this is only the R2 token's display name, Terraform does not need it. Keep its actual value private and verify what it represents before wiring it into a workflow.
- [x] Create a private Cloudflare R2 bucket for Terraform state. Bucket name: user-created (record actual name in Terraform configuration). Keep public access disabled.
- [x] Create an **Account API Token** for Terraform's automated backend access. It is scoped to this state bucket with `Object Read & Write` permissions. The backend needs the access key ID and secret access key; the R2 token display name is not required.
- [x] Obtain the R2 bucket name and Cloudflare's generated **S3 API endpoint URL** (identifiers, not secrets). Use the endpoint labeled for the S3 API, not a public/custom domain URL. Keep the bucket name and endpoint available for backend configuration.
- [x] Add `.github/workflows/terraform-staging.yml`, manually triggered via `workflow_dispatch`, to initialize the R2 backend and plan Terraform in GitHub Actions. It serializes staging runs and generates a temporary backend config at runtime; it does not apply changes or create infrastructure.
- [x] Add GitHub `staging` environment variables `CF_R2_BUCKET` and `CF_R2_ENDPOINT` (from the R2 dashboard's bucket name and S3 API URL). Existing `CF_R2_ACCESS_ID` and `CF_R2_SECRET_ACCESS_KEY` secrets are mapped to the backend credentials. Never put access keys in backend configuration.
- [x] Add GitHub `staging` secret `SB_STAGING_DB_PASSWORD`. Keep it in the password manager; Terraform state also contains it.
- [x] Run the workflow from the Actions tab after setting those variables. Remote R2 backend initialization and Terraform validation succeeded; this confirms GitHub Actions can access the state backend. No infrastructure was provisioned.
- [x] Add Terraform configuration for a Supabase staging project (`pantry-next`, region `us-east-2`). Leave `instance_size` unset: on the Free plan Supabase defaults to Nano, and explicitly setting `nano` triggers a known inconsistent-state bug in provider v1.11.0. The database password is a sensitive input and is not hard-coded.
- [x] Add these GitHub `staging` environment **Variables** (not secrets): `SB_ORG_ID=pevzfsvmmbpwzqhhzxhu`, `SB_PROJECT_NAME=pantry-next`, `SB_REGION=us-east-2`. The workflow maps these names into the Terraform input variables.
- [x] Decide that Supabase project configuration values belong in the GitHub `staging` environment rather than Terraform source defaults. The workflow expects variables `SB_ORG_ID`, `SB_PROJECT_NAME`, and `SB_REGION` and maps them to Terraform inputs.
- [x] Add GitHub Actions workflows that declare `environment: staging`, use the required backend/provider secrets, and serialize staging runs. Workflows remain manually triggered and plan-only.
- [x] Rerun the GitHub Actions workflow after committing the variable-name mapping fix (`SB_ORG_ID`, `SB_PROJECT_NAME`, `SB_REGION`). Settings validation, R2 initialization, Terraform validation, and plan all succeeded. The plan did not apply/create resources.
- [x] State inspection found `supabase_project.staging` marked `tainted` in R2 state. Supabase dashboard confirms the project exists.
- [x] Clear the tainted marker with `terraform untaint`, then run a fresh plan without applying. The plan refreshed the existing project and contained no infrastructure changes (only the missing output value).
- [x] Remove explicit Nano size from Terraform to avoid the provider v1.11.0 bug; Supabase Free plan provides Nano by default.
- [ ] Review token scopes and expiration/rotation arrangements. The Supabase organization-level `Full Access` token is broad; reduce its scope/permissions if the provider and planned resources allow it.
- [x] Add minimal health-check Worker source at `apps/healthcheck/src/index.js` (`GET /health` returns `{"status":"ok"}`; other paths return 404; non-GET returns 405).
- [x] Add Terraform Cloudflare provider and Worker/version/deployment configuration in `infra/terraform/cloudflare.tf`. The staging plan workflow expects `CF_TOKEN` and `CF_ACCOUNT_ID` and includes a plan-only step for the Worker.
- [ ] Add `CF_ACCOUNT_ID` to GitHub `staging` environment variables (Cloudflare account ID, non-secret).
- [ ] Commit and push the Worker/Terraform/workflow changes. Run `Terraform staging plan` to review the full plan. `Terraform staging plan and state check` additionally verifies the existing Supabase state and refuses destroy/replacement plans. These workflows are plan-only; no apply workflow is configured.
- [ ] Check Cloudflare R2 pricing and monitor usage. Keep state private and restrict access; Terraform state can contain sensitive resource attributes.

## Security reminders

- Never add token, R2 credential, database password, Terraform state, or saved plan contents to Git.
- Do not expose staging credentials to workflows triggered by untrusted pull requests or forks.
- Keep application runtime secrets separate from Terraform provider and backend credentials.
- If a credential is exposed, revoke/rotate it and update the corresponding GitHub environment secret.

## References

- [Cloudflare: Create R2 buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/)
- [Cloudflare: Terraform remote R2 backend](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/)
- [Cloudflare: R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Supabase: Personal access tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)
- [Terraform: S3-compatible backend](https://developer.hashicorp.com/terraform/language/backend/s3)
