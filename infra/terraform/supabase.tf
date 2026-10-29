# Reads SUPABASE_ACCESS_TOKEN from the environment.
provider "supabase" {}

resource "supabase_project" "pantrynext" {
  organization_id   = var.supabase_organization_id
  name              = var.supabase_project_name
  database_password = var.supabase_database_password
  region            = var.supabase_region
}

# Bootstrap the initial database setup once, after the Supabase project is
# provisioned. SQL changes alone do not cause this resource to run again.
resource "terraform_data" "database_setup" {
  depends_on = [supabase_project.pantrynext]

  provisioner "local-exec" {
    interpreter = ["/usr/bin/env", "bash", "-c"]
    working_dir = "${path.root}/../.."

    environment = {
      SUPABASE_PROJECT_REF   = supabase_project.pantrynext.id
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

# Create the initial Auth identity and promote it to Platform Owner.
# The service-role key is read only from the Terraform runner environment and
# is never stored in Terraform state or sent to the browser.
resource "terraform_data" "platform_owner_bootstrap" {
  depends_on = [terraform_data.database_setup]

  provisioner "local-exec" {
    interpreter = ["/usr/bin/env", "bash", "-c"]
    working_dir = "${path.root}/../.."

    environment = {
      SUPABASE_PROJECT_REF    = supabase_project.pantrynext.id
      SUPABASE_URL            = "https://${supabase_project.pantrynext.id}.supabase.co"
      PLATFORM_OWNER_EMAIL    = var.platform_owner_email
      PLATFORM_OWNER_PASSWORD = var.platform_owner_password
    }

    command = <<-EOT
      set -euo pipefail

      api_keys="$RUNNER_TEMP/project-api-keys.json"
      api_keys_status=$(curl --silent --show-error --output "$api_keys" --write-out '%%{http_code}' \
        -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
        "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/api-keys")

      [[ "$api_keys_status" == "200" ]] || { cat "$api_keys" >&2; exit 1; }
      SUPABASE_SERVICE_ROLE_KEY=$(jq -er '
        map(select(.name == "service_role" or .name == "secret" or .type == "secret"))
        | .[0].api_key
      ' "$api_keys") || {
        printf 'Could not find a server-side Supabase API key for project %s.\n' "$SUPABASE_PROJECT_REF" >&2
        exit 1
      }
      export SUPABASE_SERVICE_ROLE_KEY

      response="$RUNNER_TEMP/platform-owner-response.json"
      status=$(curl --silent --show-error --output "$response" --write-out '%%{http_code}' \
        -X POST "$SUPABASE_URL/auth/v1/admin/users" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H 'Content-Type: application/json' \
        --data "$(jq -cn \
          --arg email "$PLATFORM_OWNER_EMAIL" \
          --arg password "$PLATFORM_OWNER_PASSWORD" \
          '{email: $email, password: $password, email_confirm: true}')")

      if [[ "$status" == "200" || "$status" == "201" ]]; then
        user_id=$(jq -er '.id' "$response")
      elif [[ "$status" == "422" ]]; then
        lookup="$RUNNER_TEMP/platform-owner-lookup.json"
        lookup_status=$(curl --silent --show-error --output "$lookup" --write-out '%%{http_code}' \
          "$SUPABASE_URL/auth/v1/admin/users?per_page=1000" \
          -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

        [[ "$lookup_status" == "200" ]] || { cat "$lookup" >&2; exit 1; }
        user_id=$(jq -er --arg email "$PLATFORM_OWNER_EMAIL" '.users[] | select(.email == $email) | .id' "$lookup" | head -n 1) || {
          printf 'Auth user already exists, but the configured email was not found in the admin user list.\n' >&2
          exit 1
        }
      else
        cat "$response" >&2
        exit 1
      fi

      rendered="$RUNNER_TEMP/03-bootstrap-platform-owner.sql"
      PLATFORM_OWNER_USER_ID="$user_id" envsubst '$${PLATFORM_OWNER_USER_ID}' \
        < supabase/setup/03-bootstrap-platform-owner.sql > "$rendered"

      npx --yes supabase@2.122.0 db query \
        --linked \
        --project-ref "${supabase_project.pantrynext.id}" \
        --file "$rendered"
    EOT
  }
}

data "supabase_apikeys" "pantrynext" {
  project_ref = supabase_project.pantrynext.id
}

output "supabase_project_ref" {
  description = "Supabase project reference."
  value       = supabase_project.pantrynext.id
}

output "supabase_url" {
  description = "Supabase project API URL used by the Worker."
  value       = "https://${supabase_project.pantrynext.id}.supabase.co"
}

output "supabase_publishable_key" {
  description = "Supabase publishable API key used by the browser through the Worker."
  value       = data.supabase_apikeys.pantrynext.publishable_key
  sensitive   = true
}
