variable "supabase_organization_id" {
  description = "Supabase organization slug/ID that owns the project. Supplied via the GitHub Actions terraform environment."
  type        = string
  nullable    = false
}

variable "supabase_project_name" {
  description = "Supabase project name. Supplied via the GitHub Actions terraform environment."
  type        = string
  nullable    = false
}

variable "supabase_region" {
  description = "AWS region for the Supabase project. Supplied via the GitHub Actions terraform environment."
  type        = string
  nullable    = false
}

variable "supabase_database_password" {
  description = "Supabase database administrator password used only for project creation."
  type        = string
  sensitive   = true
  nullable    = false
}

variable "platform_owner_email" {
  description = "Email address for the initial Platform Owner Auth user."
  type        = string
  nullable    = false
}

variable "platform_owner_password" {
  description = "Password for the initial Platform Owner Auth user."
  type        = string
  sensitive   = true
  nullable    = false
}

variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the Worker and Hyperdrive configuration."
  type        = string
  nullable    = false
}

variable "hyperdrive_database_password" {
  description = "Password for the database role used by Hyperdrive and created by the initial SQL setup."
  type        = string
  sensitive   = true
  nullable    = false
}
