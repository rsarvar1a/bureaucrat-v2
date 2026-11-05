CREATE TABLE "core"."OffsiteDestination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"guild" bigint NOT NULL,
	"category" bigint NOT NULL,
	"destGuild" bigint NOT NULL,
	"reflowPending" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."OffsiteSource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"guild" bigint NOT NULL,
	"category" bigint NOT NULL,
	"destination" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "OffsiteSource_guild_category_unique" UNIQUE("guild","category")
);
--> statement-breakpoint
-- Postgres named the inline constraint itself; whichever name it has, it goes.
ALTER TABLE "core"."GameExport" DROP CONSTRAINT IF EXISTS "GameExport_game_unique";--> statement-breakpoint
ALTER TABLE "core"."GameExport" DROP CONSTRAINT IF EXISTS "GameExport_game_key";--> statement-breakpoint
ALTER TABLE "core"."GameExport" ADD COLUMN "destination" uuid;--> statement-breakpoint
-- The one archive server each guild had becomes its first destination, fed by
-- every archive the guild files games into (the default and each queue's),
-- and every export that copied or meant to copy is pointed at it.
INSERT INTO "core"."OffsiteDestination" ("guild", "category", "destGuild", "reflowPending")
SELECT "guild", "offsiteCategory", "offsiteGuild", "offsiteReflowPending"
FROM "core"."GuildSettings"
WHERE "offsiteGuild" IS NOT NULL AND "offsiteCategory" IS NOT NULL;--> statement-breakpoint
INSERT INTO "core"."OffsiteSource" ("guild", "category", "destination")
SELECT d."guild", s."archive", d."id"
FROM "core"."OffsiteDestination" d JOIN "core"."GuildSettings" s ON s."guild" = d."guild"
WHERE s."archive" IS NOT NULL
UNION
SELECT d."guild", q."archive", d."id"
FROM "core"."OffsiteDestination" d JOIN "core"."Queue" q ON q."guild" = d."guild"
WHERE q."archive" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "core"."GameExport" e SET "destination" = d."id"
FROM "core"."Game" g, "core"."OffsiteDestination" d
WHERE g."id" = e."game" AND d."guild" = g."guild" AND (e."copy" OR e."channel" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "core"."GameExport" ADD CONSTRAINT "GameExport_game_destination_unique" UNIQUE NULLS NOT DISTINCT("game","destination");--> statement-breakpoint
ALTER TABLE "core"."GameExport" ADD CONSTRAINT "GameExport_destination_OffsiteDestination_id_fkey" FOREIGN KEY ("destination") REFERENCES "core"."OffsiteDestination"("id");--> statement-breakpoint
ALTER TABLE "core"."OffsiteSource" ADD CONSTRAINT "OffsiteSource_destination_OffsiteDestination_id_fkey" FOREIGN KEY ("destination") REFERENCES "core"."OffsiteDestination"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" DROP COLUMN "offsiteGuild";--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" DROP COLUMN "offsiteCategory";--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" DROP COLUMN "offsiteReflowPending";
