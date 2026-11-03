CREATE TYPE "core"."Alignment" AS ENUM('good', 'evil');--> statement-breakpoint
ALTER TABLE "core"."Seating" ADD COLUMN "apparentAlignment" "core"."Alignment";--> statement-breakpoint
ALTER TABLE "core"."Seating" ADD COLUMN "trueAlignment" "core"."Alignment";