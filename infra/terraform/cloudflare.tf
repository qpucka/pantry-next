# Reads CLOUDFLARE_API_TOKEN from the environment.
provider "cloudflare" {}

# Hyperdrive can validate the database login only after the bootstrap SQL has
# created it. The bootstrap resource runs once after Supabase project creation.
resource "cloudflare_hyperdrive_config" "supabase" {
  account_id = var.cloudflare_account_id
  name       = "pantry-next-supabase"

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
  name       = "pantry-next"

  subdomain = {
    enabled = true
  }
}

# Deploy a minimal initial version so Terraform can establish the Worker and
# Hyperdrive binding before later application-code deployments.
resource "cloudflare_worker_version" "initial" {
  account_id         = var.cloudflare_account_id
  worker_id          = cloudflare_worker.pantry_next.id
  compatibility_date = "2026-10-26"
  main_module        = "index.js"
  deploy             = true

  migrations = {
    new_sqlite_classes = ["OrganizationRealtimeRoom"]
    new_tag            = "v1"
  }

  modules = [{
    name         = "index.js"
    content_type = "application/javascript+module"
    content_base64 = base64encode(<<-JS
      export class OrganizationRealtimeRoom {
        constructor(ctx) {
          this.ctx = ctx;
        }

        async fetch() {
          return new Response("Not implemented", { status: 501 });
        }
      }

      export default {
        async fetch() {
          return new Response("Pantry Next Worker initialized");
        }
      };
    JS
    )
  }]

  bindings = [
    {
      name = "HYPERDRIVE"
      type = "hyperdrive"
      id   = cloudflare_hyperdrive_config.supabase.id
    },
    {
      name       = "ORG_REALTIME"
      type       = "durable_object_namespace"
      class_name = "OrganizationRealtimeRoom"
    }
  ]
}

output "hyperdrive_id" {
  description = "Cloudflare Hyperdrive configuration ID bound to the Worker."
  value       = cloudflare_hyperdrive_config.supabase.id
}

output "worker_name" {
  description = "Cloudflare Worker name."
  value       = cloudflare_worker.pantry_next.name
}
