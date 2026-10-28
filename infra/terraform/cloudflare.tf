# Reads CLOUDFLARE_API_TOKEN from the environment.
provider "cloudflare" {}

# Hyperdrive can validate the database login only after the bootstrap SQL has
# created it. The bootstrap resource runs once after Supabase project creation.
resource "cloudflare_hyperdrive_config" "supabase" {
  account_id = var.cloudflare_account_id
  name       = "pantrynext-supabase"

  origin = {
    scheme   = "postgresql"
    host     = "db.${supabase_project.pantry_next.id}.supabase.co"
    port     = 5432
    database = "postgres"
    user     = "cloudflare_hyperdrive_role"
    password = var.hyperdrive_database_password
  }

  caching = {
    disabled = true
  }

  origin_connection_limit = 5

  depends_on = [terraform_data.database_setup]
}

resource "cloudflare_worker" "pantry_next" {
  account_id = var.cloudflare_account_id
  name       = "pantrynext"

  subdomain = {
    enabled = true
  }
}

output "hyperdrive_id" {
  description = "Cloudflare Hyperdrive configuration ID bound to the Worker."
  value       = cloudflare_hyperdrive_config.supabase.id
}

output "worker_name" {
  description = "Cloudflare Worker name."
  value       = cloudflare_worker.pantry_next.name
}
