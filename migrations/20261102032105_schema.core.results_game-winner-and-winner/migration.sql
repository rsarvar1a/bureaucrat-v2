CREATE TABLE "core"."GameWinner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"participant" uuid,
	"member" bigint NOT NULL,
	"role" text,
	"alignment" "core"."Alignment",
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "GameWinner_game_member_unique" UNIQUE("game","member")
);
--> statement-breakpoint
ALTER TABLE "core"."Game" ADD COLUMN "winner" "core"."Alignment";--> statement-breakpoint
ALTER TABLE "core"."GameWinner" ADD CONSTRAINT "GameWinner_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."GameWinner" ADD CONSTRAINT "GameWinner_participant_Participant_id_fkey" FOREIGN KEY ("participant") REFERENCES "core"."Participant"("id") ON DELETE SET NULL;