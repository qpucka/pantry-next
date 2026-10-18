name: Terraform staging apply

on:
  workflow_dispatch:
    inputs:
      confirmation:
        description: 'Type exactly: CREATE pantry-next staging'
        required: true
        type: string

permissions:
  contents: read

# Serialize all workflow runs that operate on this staging state.
concurrency:
  group: terraform-staging
  cancel-in-progress: false

jobs:
  apply:
    name: Review and apply Supabase staging project
    runs-on: ubuntu-latest
    environment: staging
    env:
      TF_IN_AUTOMATION: "true"
      AWS_ACCESS_KEY_ID: ${{ secrets.CF_R2_ACCESS_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.CF_R2_SECRET_ACCESS_KEY }}
      AWS_REGION: auto
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SB_TOKEN }}
      TF_VAR_supabase_database_password: ${{ secrets.SB_STAGING_DB_PASSWORD }}
      TF_VAR_supabase_organization_id: ${{ vars.SB_ORG_ID }}
      TF_VAR_supabase_project_name: ${{ vars.SB_PROJECT_NAME }}
      TF_VAR_supabase_region: ${{ vars.SB_REGION }}
      R2_BUCKET: ${{ vars.CF_R2_BUCKET }}
      R2_ENDPOINT: ${{ vars.CF_R2_ENDPOINT }}
      APPLY_CONFIRMATION: ${{ inputs.confirmation }}

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_wrapper: false

      - name: Verify explicit confirmation and required settings
        shell: bash
        run: |
          set -euo pipefail
          test "$APPLY_CONFIRMATION" = "CREATE pantry-next staging" || {
            echo 'Confirmation must exactly match: CREATE pantry-next staging' >&2
            exit 1
          }
          test -n "$AWS_ACCESS_KEY_ID" || { echo "Missing secret CF_R2_ACCESS_ID" >&2; exit 1; }
          test -n "$AWS_SECRET_ACCESS_KEY" || { echo "Missing secret CF_R2_SECRET_ACCESS_KEY" >&2; exit 1; }
          test -n "$SUPABASE_ACCESS_TOKEN" || { echo "Missing secret SB_TOKEN" >&2; exit 1; }
          test -n "$TF_VAR_supabase_database_password" || { echo "Missing secret SB_STAGING_DB_PASSWORD" >&2; exit 1; }
          test -n "$TF_VAR_supabase_organization_id" || { echo "Missing variable SB_ORG_ID" >&2; exit 1; }
          test -n "$TF_VAR_supabase_project_name" || { echo "Missing variable SB_PROJECT_NAME" >&2; exit 1; }
          test -n "$TF_VAR_supabase_region" || { echo "Missing variable SB_REGION" >&2; exit 1; }
          test -n "$R2_BUCKET" || { echo "Missing variable CF_R2_BUCKET" >&2; exit 1; }
          test -n "$R2_ENDPOINT" || { echo "Missing variable CF_R2_ENDPOINT" >&2; exit 1; }
          test "$TF_VAR_supabase_project_name" = "pantry-next" || { echo "Project name is not pantry-next; refusing apply" >&2; exit 1; }
          test "$TF_VAR_supabase_region" = "us-east-2" || { echo "Region is not us-east-2; refusing apply" >&2; exit 1; }

      - name: Create temporary backend config
        shell: bash
        run: |
          set -euo pipefail
          cat > "$RUNNER_TEMP/backend.hcl" <<EOF
          bucket = "$R2_BUCKET"
          key    = "pantry-manager/staging/terraform.tfstate"
          region = "auto"

          endpoints = {
            s3 = "$R2_ENDPOINT"
          }

          skip_credentials_validation = true
          skip_metadata_api_check     = true
          skip_region_validation      = true
          skip_requesting_account_id  = true
          skip_s3_checksum            = true
          use_path_style              = true
          EOF

      - name: Initialize R2 backend
        run: terraform -chdir=infra/terraform init -input=false -reconfigure -backend-config="$RUNNER_TEMP/backend.hcl"

      - name: Validate Terraform configuration
        run: terraform -chdir=infra/terraform validate

      - name: Create fresh plan
        run: terraform -chdir=infra/terraform plan -input=false -no-color -out="$RUNNER_TEMP/staging.tfplan"

      - name: Verify plan contains only the intended Nano project
        shell: bash
        run: |
          set -euo pipefail
          terraform -chdir=infra/terraform show -json "$RUNNER_TEMP/staging.tfplan" |
            python3 -c '
          import json, sys
          plan = json.load(sys.stdin)
          changes = [c for c in plan.get("resource_changes", []) if c.get("change", {}).get("actions") != ["no-op"]]
          if len(changes) != 1:
              raise SystemExit(f"Refusing apply: expected exactly one resource change, got {len(changes)}")
          c = changes[0]
          if c.get("address") != "supabase_project.staging" or c.get("change", {}).get("actions") != ["create"]:
              raise SystemExit("Refusing apply: plan is not a create of supabase_project.staging only")
          after = c.get("change", {}).get("after") or {}
          expected = {"name": "pantry-next", "organization_id": "pevzfsvmmbpwzqhhzxhu", "region": "us-east-2", "instance_size": "nano"}
          for key, value in expected.items():
              if after.get(key) != value:
                  raise SystemExit(f"Refusing apply: {key} does not match expected value")
          print("Plan guard passed: one Supabase project create, pantry-next / us-east-2 / nano; no other resource changes.")
          '

      - name: Apply the exact verified plan
        run: terraform -chdir=infra/terraform apply -input=false -no-color "$RUNNER_TEMP/staging.tfplan"

      - name: Show created project reference
        run: terraform -chdir=infra/terraform output -raw supabase_project_ref
