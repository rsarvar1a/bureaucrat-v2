CREATE TABLE "core"."GameMemberMessageStats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"stats" uuid NOT NULL,
	"member" bigint NOT NULL,
	"messages" integer NOT NULL,
	"played" integer NOT NULL,
	CONSTRAINT "GameMemberMessageStats_stats_member_unique" UNIQUE("stats","member")
);
--> statement-breakpoint
CREATE TABLE "core"."GameMessageStats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL UNIQUE,
	"export" uuid NOT NULL,
	"exportMessages" integer NOT NULL,
	"messages" integer NOT NULL,
	"played" integer NOT NULL,
	"threads" integer NOT NULL,
	"authors" integer NOT NULL,
	"firstAt" timestamp,
	"lastAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" ADD COLUMN "statsNormalization" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GameMemberMessageStats" ADD CONSTRAINT "GameMemberMessageStats_stats_GameMessageStats_id_fkey" FOREIGN KEY ("stats") REFERENCES "core"."GameMessageStats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."GameMessageStats" ADD CONSTRAINT "GameMessageStats_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."GameMessageStats" ADD CONSTRAINT "GameMessageStats_export_GameExport_id_fkey" FOREIGN KEY ("export") REFERENCES "core"."GameExport"("id") ON DELETE CASCADE;