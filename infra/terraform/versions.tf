terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.11.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
  }
}
