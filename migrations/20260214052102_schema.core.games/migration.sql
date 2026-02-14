CREATE TYPE "core"."GameState" AS ENUM('signups', 'running', 'completed');--> statement-breakpoint
CREATE TYPE "core"."Phase" AS ENUM('night', 'day');--> statement-breakpoint
CREATE TYPE "core"."PlayerState" AS ENUM('alive', 'dead', 'spent');--> statement-breakpoint
CREATE TABLE "core"."Game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"queue" uuid,
	"creator" bigint NOT NULL,
	"state" "core"."GameState" DEFAULT 'signups'::"core"."GameState" NOT NULL,
	"guild" bigint NOT NULL,
	"channel" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."GamePhase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"phase" "core"."Phase" NOT NULL,
	"on" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "GamePhase_game_phase_on_unique" UNIQUE("game","phase","on")
);
--> statement-breakpoint
CREATE TABLE "core"."Participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"role" "core"."Role" NOT NULL,
	"member" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Participant_game_member_unique" UNIQUE("game","member")
);
--> statement-breakpoint
CREATE TABLE "core"."Nomination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"phase" uuid NOT NULL,
	"plaintiff" uuid NOT NULL,
	"defendant" uuid NOT NULL,
	"required" integer NOT NULL,
	"block" boolean DEFAULT false NOT NULL,
	"accusation" text,
	"defense" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Nomination_phase_plaintiff_unique" UNIQUE("phase","plaintiff"),
	CONSTRAINT "Nomination_phase_defendant_unique" UNIQUE("phase","defendant")
);
--> statement-breakpoint
CREATE TABLE "core"."Vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"nomination" uuid NOT NULL,
	"player" uuid NOT NULL,
	"state" "core"."PlayerState" NOT NULL,
	"lock" integer,
	"public" text,
	"private" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Vote_nomination_player_unique" UNIQUE("nomination","player")
);
--> statement-breakpoint
CREATE TABLE "core"."Seating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"player" uuid NOT NULL,
	"seat" integer NOT NULL,
	"state" "core"."PlayerState" DEFAULT 'alive'::"core"."PlayerState" NOT NULL,
	"traveler" boolean DEFAULT false NOT NULL,
	"claim" text,
	"apparentRole" text,
	"claimedRole" text,
	"trueRole" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Seating_game_seat_unique" UNIQUE("game","seat")
);
--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" RENAME COLUMN "queueEntryId" TO "entry";--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" DROP CONSTRAINT "QueueEntrySignup_pkey";--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" ADD CONSTRAINT "QueueEntrySignup_member_entry_unique" UNIQUE("member","entry");--> statement-breakpoint
ALTER TABLE "core"."Game" ADD CONSTRAINT "Game_queue_Queue_id_fkey" FOREIGN KEY ("queue") REFERENCES "core"."Queue"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "core"."GamePhase" ADD CONSTRAINT "GamePhase_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Participant" ADD CONSTRAINT "Participant_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Nomination" ADD CONSTRAINT "Nomination_phase_GamePhase_id_fkey" FOREIGN KEY ("phase") REFERENCES "core"."GamePhase"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Nomination" ADD CONSTRAINT "Nomination_plaintiff_Seating_id_fkey" FOREIGN KEY ("plaintiff") REFERENCES "core"."Seating"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Nomination" ADD CONSTRAINT "Nomination_defendant_Seating_id_fkey" FOREIGN KEY ("defendant") REFERENCES "core"."Seating"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Vote" ADD CONSTRAINT "Vote_nomination_Nomination_id_fkey" FOREIGN KEY ("nomination") REFERENCES "core"."Nomination"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Vote" ADD CONSTRAINT "Vote_player_Seating_id_fkey" FOREIGN KEY ("player") REFERENCES "core"."Seating"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Seating" ADD CONSTRAINT "Seating_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Seating" ADD CONSTRAINT "Seating_player_Participant_id_fkey" FOREIGN KEY ("player") REFERENCES "core"."Participant"("id") ON DELETE CASCADE;