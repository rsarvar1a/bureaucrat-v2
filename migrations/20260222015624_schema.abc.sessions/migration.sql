CREATE TABLE "abc"."InteractionSession" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"flow" text NOT NULL,
	"step" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"member" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abc"."InteractionSession" ADD CONSTRAINT "InteractionSession_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;