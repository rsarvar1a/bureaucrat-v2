ALTER TYPE "core"."WhisperMode" ADD VALUE 'hybrid';--> statement-breakpoint
CREATE TABLE "core"."Script" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL UNIQUE,
	"name" text,
	"author" text,
	"link" text,
	"json" jsonb,
	"jsonName" text,
	"pdf" bytea,
	"pdfName" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD COLUMN "playerCount" integer;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD COLUMN "groupWhispers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Signup" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "core"."Seating" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "core"."Signup" DROP COLUMN "accepted";--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ALTER COLUMN "travelerWhisperPenalty" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ALTER COLUMN "travelerWhisperPenalty" SET DATA TYPE boolean USING true;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ALTER COLUMN "travelerWhisperPenalty" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "core"."Script" ADD CONSTRAINT "Script_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;