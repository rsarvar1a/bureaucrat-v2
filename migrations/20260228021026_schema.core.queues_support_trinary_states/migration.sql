ALTER TABLE "core"."Queue" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "core"."QueueEntry" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."QueueEntry" ALTER COLUMN "minimumStartDate" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "core"."QueueEntry" ALTER COLUMN "minimumStartDate" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" ALTER COLUMN "accepted" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" ALTER COLUMN "accepted" DROP NOT NULL;