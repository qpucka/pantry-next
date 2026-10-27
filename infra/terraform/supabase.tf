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

      for sql in supabase/setup/*.sql; do
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
