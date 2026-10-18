resource "supabase_project" "staging" {
  organization_id   = var.supabase_organization_id
  name              = var.supabase_project_name
  database_password = var.supabase_database_password
  region            = var.supabase_region
  instance_size     = "nano"
}

output "supabase_project_ref" {
  description = "Supabase project reference for the staging environment."
  value       = supabase_project.staging.id
}

