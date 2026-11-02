CREATE TABLE "core"."Reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL,
	"author" bigint NOT NULL,
	"channel" bigint NOT NULL,
	"message" text NOT NULL,
	"fireAt" timestamp NOT NULL,
	"offsets" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"posted" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"mentions" "core"."Role"[] DEFAULT '{}'::"core"."Role"[] NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."Reminder" ADD CONSTRAINT "Reminder_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;