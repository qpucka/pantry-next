-- Promote the Terraform-created or pre-existing bootstrap Auth user.
-- The UUID is rendered by the Terraform bootstrap command.
INSERT INTO app.platform_admins (user_id, role)
VALUES ('${PLATFORM_OWNER_USER_ID}', 'platform_owner')
ON CONFLICT (user_id) DO UPDATE SET role = 'platform_owner';
