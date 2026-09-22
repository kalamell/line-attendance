ALTER TABLE "line_onboarding" ADD COLUMN "locale" varchar(5) DEFAULT 'th' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" varchar(5) DEFAULT 'th' NOT NULL;