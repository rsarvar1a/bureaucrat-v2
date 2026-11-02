CREATE TYPE "core"."WhisperState" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "core"."Whisper" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"initiator" uuid NOT NULL,
	"day" integer NOT NULL,
	"async" boolean DEFAULT false NOT NULL,
	"free" boolean DEFAULT false NOT NULL,
	"state" "core"."WhisperState" DEFAULT 'pending'::"core"."WhisperState" NOT NULL,
	"thread" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."WhisperParticipant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"whisper" uuid NOT NULL,
	"participant" uuid NOT NULL,
	"accepted" boolean,
	"cost" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "WhisperParticipant_whisper_participant_unique" UNIQUE("whisper","participant")
);
--> statement-breakpoint
ALTER TABLE "core"."Whisper" ADD CONSTRAINT "Whisper_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Whisper" ADD CONSTRAINT "Whisper_initiator_Participant_id_fkey" FOREIGN KEY ("initiator") REFERENCES "core"."Participant"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Whisper" ADD CONSTRAINT "Whisper_thread_ManagedThread_id_fkey" FOREIGN KEY ("thread") REFERENCES "core"."ManagedThread"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "core"."WhisperParticipant" ADD CONSTRAINT "WhisperParticipant_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."WhisperParticipant" ADD CONSTRAINT "WhisperParticipant_whisper_Whisper_id_fkey" FOREIGN KEY ("whisper") REFERENCES "core"."Whisper"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."WhisperParticipant" ADD CONSTRAINT "WhisperParticipant_participant_Participant_id_fkey" FOREIGN KEY ("participant") REFERENCES "core"."Participant"("id");--> statement-breakpoint
ALTER TABLE "core"."WhisperParticipant" ADD CONSTRAINT "WhisperParticipant_game_participant_Participant_game_id_fkey" FOREIGN KEY ("game","participant") REFERENCES "core"."Participant"("game","id") ON DELETE CASCADE;