CREATE TABLE "core"."Signup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"role" "core"."Role" NOT NULL,
	"member" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "Signup_game_member_unique" UNIQUE("game","member"),
	CONSTRAINT "Signup_game_id_unique" UNIQUE("game","id")
);
--> statement-breakpoint
ALTER TABLE "core"."Signup" ADD CONSTRAINT "Signup_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;