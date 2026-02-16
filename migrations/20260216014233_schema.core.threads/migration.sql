CREATE TYPE "core"."ThreadType" AS ENUM('storyteller', 'kibitz', 'public', 'ST thread', 'whisper');--> statement-breakpoint
CREATE TABLE "core"."Follow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"target" uuid NOT NULL,
	"follower" uuid NOT NULL,
	CONSTRAINT "Follow_target_follower_unique" UNIQUE("target","follower")
);
--> statement-breakpoint
CREATE TABLE "core"."ManagedThread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"kind" "core"."ThreadType" NOT NULL,
	"tag" text,
	"thread" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."ManagedThreadParticipant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"thread" uuid NOT NULL,
	"participant" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."Follow" ADD CONSTRAINT "Follow_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Follow" ADD CONSTRAINT "Follow_target_Participant_id_fkey" FOREIGN KEY ("target") REFERENCES "core"."Participant"("id");--> statement-breakpoint
ALTER TABLE "core"."Follow" ADD CONSTRAINT "Follow_follower_Participant_id_fkey" FOREIGN KEY ("follower") REFERENCES "core"."Participant"("id");--> statement-breakpoint
ALTER TABLE "core"."Follow" ADD CONSTRAINT "Follow_game_target_Participant_game_id_fkey" FOREIGN KEY ("game","target") REFERENCES "core"."Participant"("game","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Follow" ADD CONSTRAINT "Follow_game_follower_Participant_game_id_fkey" FOREIGN KEY ("game","follower") REFERENCES "core"."Participant"("game","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."ManagedThread" ADD CONSTRAINT "ManagedThread_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."ManagedThreadParticipant" ADD CONSTRAINT "ManagedThreadParticipant_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."ManagedThreadParticipant" ADD CONSTRAINT "ManagedThreadParticipant_thread_ManagedThread_id_fkey" FOREIGN KEY ("thread") REFERENCES "core"."ManagedThread"("id");--> statement-breakpoint
ALTER TABLE "core"."ManagedThreadParticipant" ADD CONSTRAINT "ManagedThreadParticipant_participant_Participant_id_fkey" FOREIGN KEY ("participant") REFERENCES "core"."Participant"("id");--> statement-breakpoint
ALTER TABLE "core"."ManagedThreadParticipant" ADD CONSTRAINT "ManagedThreadParticipant_game_thread_ManagedThread_game_id_fkey" FOREIGN KEY ("game","thread") REFERENCES "core"."ManagedThread"("game","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."ManagedThreadParticipant" ADD CONSTRAINT "ManagedThreadParticipant_yVovpUWhRoKg_fkey" FOREIGN KEY ("game","participant") REFERENCES "core"."Participant"("game","id") ON DELETE CASCADE;