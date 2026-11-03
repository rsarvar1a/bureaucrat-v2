ALTER TABLE "core"."GameSettings" ADD COLUMN "travelerWhispers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The toggle inverts: "penalty on" was the default and means traveler whispers cost as normal.
UPDATE "core"."GameSettings" SET "travelerWhispers" = NOT "travelerWhisperPenalty";--> statement-breakpoint
ALTER TABLE "core"."GameSettings" DROP COLUMN "travelerWhisperPenalty";
