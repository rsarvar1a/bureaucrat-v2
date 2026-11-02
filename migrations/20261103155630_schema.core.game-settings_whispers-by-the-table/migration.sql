ALTER TABLE "core"."GameSettings" ALTER COLUMN "whispersPerDay" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ALTER COLUMN "whispersPerDay" DROP NOT NULL;