ALTER TABLE "tenant_line_channels" ADD COLUMN "login_channel_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;