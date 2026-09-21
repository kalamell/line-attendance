CREATE TYPE "public"."onboarding_status" AS ENUM('incoming', 'flex_sent', 'confirmed', 'linked', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "line_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"line_user_id" text NOT NULL,
	"display_name" text,
	"picture_url" text,
	"status" "onboarding_status" DEFAULT 'incoming' NOT NULL,
	"linked_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_onboarding" ADD CONSTRAINT "line_onboarding_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_onboarding" ADD CONSTRAINT "line_onboarding_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_tenant_line_uq" ON "line_onboarding" USING btree ("tenant_id","line_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_tenant_status_idx" ON "line_onboarding" USING btree ("tenant_id","status");