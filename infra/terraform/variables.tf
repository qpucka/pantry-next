variable "supabase_organization_id" {
  description = "Supabase organization slug/ID that owns the staging project. Supplied via the GitHub staging environment."
  type        = string
  nullable    = false
}

variable "supabase_project_name" {
  description = "Name for the staging Supabase project. Supplied via the GitHub staging environment."
  type        = string
  nullable    = false
}

variable "supabase_region" {
  description = "AWS region for the Supabase project. Supplied via the GitHub staging environment."
  type        = string
  nullable    = false
}

variable "supabase_database_password" {
  description = "Database password for the staging Supabase project; supplied via GitHub environment secret."
  type        = string
  sensitive   = true
  nullable    = false
}
