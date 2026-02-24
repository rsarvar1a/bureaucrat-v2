ALTER TABLE "core"."QueueEntry" ALTER COLUMN "minimumStartDate" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "core"."QueueEntry" ALTER COLUMN "minimumStartDate" DROP NOT NULL;