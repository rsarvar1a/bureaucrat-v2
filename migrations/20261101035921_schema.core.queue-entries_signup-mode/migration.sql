CREATE TYPE "core"."SignupMode" AS ENUM('open', 'applications', 'closed');--> statement-breakpoint
ALTER TABLE "core"."QueueEntry" ADD COLUMN "signups" "core"."SignupMode" DEFAULT 'applications'::"core"."SignupMode" NOT NULL;--> statement-breakpoint
UPDATE "core"."QueueEntry" SET "signups" = CASE WHEN "public" THEN 'open'::"core"."SignupMode" ELSE 'applications'::"core"."SignupMode" END;--> statement-breakpoint
ALTER TABLE "core"."QueueEntry" DROP COLUMN "public";