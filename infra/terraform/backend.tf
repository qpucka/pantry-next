terraform {
  # Terraform backend configuration is supplied at `terraform init` time.
  # This avoids putting backend credentials in source or .terraform metadata.
  backend "s3" {}
}
