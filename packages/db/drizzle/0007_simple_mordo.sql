ALTER TABLE "users" ADD COLUMN "office_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_office_id_office_locations_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."office_locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
