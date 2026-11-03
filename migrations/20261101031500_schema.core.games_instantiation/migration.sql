CREATE TYPE "core"."WhisperMode" AS ENUM('sync', 'async');--> statement-breakpoint
ALTER TYPE "core"."ThreadType" ADD VALUE 'config';--> statement-breakpoint
CREATE TABLE "core"."GameSettings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL UNIQUE,
	"plannedThreads" text[] DEFAULT '{}'::text[] NOT NULL,
	"whispersPerDay" integer DEFAULT 1 NOT NULL,
	"travelerWhisperPenalty" integer DEFAULT 0 NOT NULL,
	"whisperMode" "core"."WhisperMode" DEFAULT 'sync'::"core"."WhisperMode" NOT NULL,
	"asyncWhispersPerDay" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."Game" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD CONSTRAINT "GameSettings_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;