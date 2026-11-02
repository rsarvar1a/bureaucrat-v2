CREATE TYPE "core"."NominationKind" AS ENUM('execution', 'exile', 'storyteller');--> statement-breakpoint
ALTER TABLE "core"."Nomination" DROP CONSTRAINT "Nomination_phase_plaintiff_unique";--> statement-breakpoint
ALTER TABLE "core"."Nomination" DROP CONSTRAINT "Nomination_phase_defendant_unique";--> statement-breakpoint
ALTER TABLE "core"."GamePhase" ADD COLUMN "nominationsOpenedAt" timestamp;--> statement-breakpoint
ALTER TABLE "core"."GamePhase" ADD COLUMN "nominationsClosedAt" timestamp;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD COLUMN "nominationsAfter" integer;--> statement-breakpoint
ALTER TABLE "core"."Nomination" ADD COLUMN "kind" "core"."NominationKind" NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Vote" ADD COLUMN "position" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Vote" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Vote" ADD COLUMN "yes" boolean;--> statement-breakpoint
ALTER TABLE "core"."Vote" ADD COLUMN "weight" integer;--> statement-breakpoint
ALTER TABLE "core"."Vote" ADD COLUMN "spent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Vote" DROP COLUMN "lock";--> statement-breakpoint
ALTER TABLE "core"."Nomination" ALTER COLUMN "defendant" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Vote" ADD CONSTRAINT "Vote_nomination_position_unique" UNIQUE("nomination","position");--> statement-breakpoint
CREATE UNIQUE INDEX "Nomination_phase_plaintiff_idx" ON "core"."Nomination" ("phase","plaintiff") WHERE "kind" <> 'exile';--> statement-breakpoint
CREATE UNIQUE INDEX "Nomination_phase_defendant_idx" ON "core"."Nomination" ("phase","defendant") WHERE "kind" <> 'exile';--> statement-breakpoint
CREATE UNIQUE INDEX "Nomination_phase_storyteller_idx" ON "core"."Nomination" ("phase") WHERE "kind" = 'storyteller';