provider "cloudflare" {
  # Reads CLOUDFLARE_API_TOKEN from the environment.
}

resource "cloudflare_worker" "healthcheck" {
  account_id = var.cloudflare_account_id
  name       = "pantry-next-healthcheck"

  subdomain = {
    enabled          = true
    previews_enabled = false
  }

  observability = {
    enabled = true
  }
}

resource "cloudflare_worker_version" "healthcheck" {
  account_id         = var.cloudflare_account_id
  worker_id          = cloudflare_worker.healthcheck.id
  compatibility_date = "2026-10-18"
  main_module        = "index.js"
  deploy             = true

  annotations = {
    workers_message = "Deploy minimal health check endpoint"
  }

  modules = [{
    name         = "index.js"
    content_type = "application/javascript+module"
    content_file = "${path.module}/../../apps/healthcheck/src/index.js"
  }]
}

output "healthcheck_worker_url" {
  description = "Cloudflare workers.dev URL for the health check Worker."
  value       = cloudflare_worker.healthcheck.subdomain.url
}
