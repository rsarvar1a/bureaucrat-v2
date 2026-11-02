CREATE TABLE "core"."GameRating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"member" bigint NOT NULL,
	"role" "core"."Role" NOT NULL,
	"script" integer NOT NULL,
	"decisions" integer NOT NULL,
	"storytelling" integer NOT NULL,
	"comment" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "GameRating_game_member_unique" UNIQUE("game","member")
);
--> statement-breakpoint
ALTER TABLE "core"."GameRating" ADD CONSTRAINT "GameRating_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;