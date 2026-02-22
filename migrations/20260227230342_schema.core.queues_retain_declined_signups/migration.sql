ALTER TABLE "core"."QueueEntry" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" ALTER COLUMN "accepted" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" ALTER COLUMN "accepted" DROP NOT NULL;