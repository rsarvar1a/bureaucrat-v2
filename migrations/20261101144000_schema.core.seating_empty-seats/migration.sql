ALTER TABLE "core"."Seating" ALTER COLUMN "player" DROP NOT NULL;--> statement-breakpoint
-- Test players (Participants with a negative member id) become empty seats.
UPDATE "core"."Seating" SET "player" = NULL WHERE "player" IN (SELECT "id" FROM "core"."Participant" WHERE "member" < 0);--> statement-breakpoint
DELETE FROM "core"."Participant" WHERE "member" < 0;
