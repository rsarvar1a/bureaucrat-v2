ALTER TABLE "core"."GameSettings" ADD COLUMN "rolesLive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD COLUMN "publishedSeating" jsonb;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD COLUMN "publishedAt" timestamp;