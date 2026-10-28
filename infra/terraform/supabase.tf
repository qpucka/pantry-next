# Reads SUPABASE_ACCESS_TOKEN from the environment.
provider "supabase" {}

resource "supabase_project" "pantry_next" {
  organization_id   = var.supabase_organization_id
  name              = var.supabase_project_name
  database_password = var.supabase_database_password
  region            = var.supabase_region
}

# Bootstrap the initial database setup once, after the Supabase project is
# provisioned. SQL changes alone do not cause this resource to run again.
resource "terraform_data" "database_setup" {
  depends_on = [supabase_project.pantry_next]

  provisioner "local-exec" {
    interpreter = ["/usr/bin/env", "bash", "-c"]
    working_dir = "${path.root}/../.."

    environment = {
      SUPABASE_PROJECT_REF   = supabase_project.pantry_next.id
      HYPERDRIVE_DB_PASSWORD = var.hyperdrive_database_password
    }

    command = <<-EOT
      set -euo pipefail

      for sql in supabase/setup/00-create-schema.sql supabase/setup/01-create-hyperdrive-role.sql supabase/setup/02-grants.sql; do
        rendered="$RUNNER_TEMP/$(basename "$sql")"
        envsubst '$${HYPERDRIVE_DB_PASSWORD}' < "$sql" > "$rendered"

        npx --yes supabase@2.122.0 db query \
          --linked \
          --project-ref "$SUPABASE_PROJECT_REF" \
          --file "$rendered"
      done
    EOT
  }
}

# Create the initial Auth identity and promote it to Platform Administrator.
# The service-role key is read only from the Terraform runner environment and
# is never stored in Terraform state or sent to the browser.
resource "terraform_data" "platform_admin_bootstrap" {
  depends_on = [terraform_data.database_setup]

  provisioner "local-exec" {
    interpreter = ["/usr/bin/env", "bash", "-c"]
    working_dir = "${path.root}/../.."

    environment = {
      SUPABASE_URL            = "https://${supabase_project.pantry_next.id}.supabase.co"
      PLATFORM_ADMIN_EMAIL    = var.platform_admin_email
      PLATFORM_ADMIN_PASSWORD = var.platform_admin_password
    }

    command = <<-EOT
      set -euo pipefail

      response="$RUNNER_TEMP/platform-admin-response.json"
      status=$(curl --silent --show-error --output "$response" --write-out '%%{http_code}' \
        -X POST "$SUPABASE_URL/auth/v1/admin/users" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H 'Content-Type: application/json' \
        --data "$(jq -cn \
          --arg email "$PLATFORM_ADMIN_EMAIL" \
          --arg password "$PLATFORM_ADMIN_PASSWORD" \
          '{email: $email, password: $password, email_confirm: true}')")"

      if [[ "$status" == "200" || "$status" == "201" ]]; then
        user_id=$(jq -er '.id' "$response")
      elif [[ "$status" == "422" ]]; then
        lookup="$RUNNER_TEMP/platform-admin-lookup.json"
        lookup_status=$(curl --silent --show-error --output "$lookup" --write-out '%%{http_code}' \
          "$SUPABASE_URL/auth/v1/admin/users?per_page=1000" \
          -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

        [[ "$lookup_status" == "200" ]] || { cat "$lookup" >&2; exit 1; }
        user_id=$(jq -er --arg email "$PLATFORM_ADMIN_EMAIL" '.users[] | select(.email == $email) | .id' "$lookup" | head -n 1) || {
          printf 'Auth user already exists, but the configured email was not found in the admin user list.\n' >&2
          exit 1
        }
      else
        cat "$response" >&2
        exit 1
      fi

      rendered="$RUNNER_TEMP/03-bootstrap-platform-admin.sql"
      PLATFORM_ADMIN_USER_ID="$user_id" envsubst '$${PLATFORM_ADMIN_USER_ID}' \
        < supabase/setup/03-bootstrap-platform-admin.sql > "$rendered"

      npx --yes supabase@2.122.0 db query \
        --linked \
        --project-ref "${supabase_project.pantry_next.id}" \
        --file "$rendered"
    EOT
  }
}

data "supabase_apikeys" "pantry_next" {
  project_ref = supabase_project.pantry_next.id
}

output "supabase_project_ref" {
  description = "Supabase project reference."
  value       = supabase_project.pantry_next.id
}

output "supabase_url" {
  description = "Supabase project API URL used by the Worker."
  value       = "https://${supabase_project.pantry_next.id}.supabase.co"
}

output "supabase_publishable_key" {
  description = "Supabase publishable API key used by the browser through the Worker."
  value       = data.supabase_apikeys.pantry_next.publishable_key
  sensitive   = true
}
