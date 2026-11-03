ALTER TYPE "core"."WhisperState" ADD VALUE 'ended';--> statement-breakpoint
ALTER TABLE "core"."Whisper" ADD COLUMN "promoting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."WhisperParticipant" ADD COLUMN "endedAt" timestamp;--> statement-breakpoint
ALTER TABLE "core"."WhisperParticipant" ADD COLUMN "promote" boolean;