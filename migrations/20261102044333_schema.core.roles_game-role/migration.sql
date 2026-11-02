CREATE TABLE "core"."GameRole" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"role" "core"."Role" NOT NULL,
	"discordRole" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "GameRole_game_role_unique" UNIQUE("game","role")
);
--> statement-breakpoint
ALTER TABLE "core"."GameRole" ADD CONSTRAINT "GameRole_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;