ALTER TABLE "core"."GameSettings" ADD COLUMN "privateVotes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD COLUMN "nominationThread" text;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD COLUMN "nominateStoryteller" boolean DEFAULT false NOT NULL;