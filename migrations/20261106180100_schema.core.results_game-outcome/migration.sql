CREATE TABLE "core"."GameOutcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"winner" "core"."Alignment" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "GameOutcome_game_position_unique" UNIQUE("game","position")
);
--> statement-breakpoint
ALTER TABLE "core"."GameOutcome" ADD CONSTRAINT "GameOutcome_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
INSERT INTO "core"."GameOutcome" ("game", "position", "winner")
SELECT "id", 1, "winner" FROM "core"."Game" WHERE "winner" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GameWinner" DROP CONSTRAINT "GameWinner_game_member_unique";--> statement-breakpoint
ALTER TABLE "core"."GameWinner" ADD COLUMN "outcome" uuid;--> statement-breakpoint
UPDATE "core"."GameWinner" w SET "outcome" = o."id"
FROM "core"."GameOutcome" o
WHERE o."game" = w."game" AND o."position" = 1;--> statement-breakpoint
ALTER TABLE "core"."GameWinner" ALTER COLUMN "outcome" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GameWinner" ADD CONSTRAINT "GameWinner_outcome_GameOutcome_id_fkey" FOREIGN KEY ("outcome") REFERENCES "core"."GameOutcome"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."GameWinner" ADD CONSTRAINT "GameWinner_outcome_member_unique" UNIQUE("outcome","member");--> statement-breakpoint
ALTER TABLE "core"."Game" DROP COLUMN "winner";
