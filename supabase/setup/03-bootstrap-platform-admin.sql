-- Promote the Terraform-created or pre-existing bootstrap Auth user.
-- The UUID is rendered by the Terraform bootstrap command.
INSERT INTO app.platform_admins (user_id)
VALUES ('${PLATFORM_ADMIN_USER_ID}')
ON CONFLICT (user_id) DO NOTHING;
