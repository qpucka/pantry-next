terraform {
  # Terraform state is stored in Cloudflare R2 through the S3-compatible
  # backend. The skip_* and use_path_style settings are required because R2 is
  # not AWS S3. Credentials come from the AWS_* environment variables, and the
  # bucket name is supplied by the workflows with -backend-config at init time
  # because it comes from a GitHub environment variable. Backend blocks cannot
  # reference Terraform variables, so everything here must be a literal.
  backend "s3" {
    key                         = "pantry-next/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}
