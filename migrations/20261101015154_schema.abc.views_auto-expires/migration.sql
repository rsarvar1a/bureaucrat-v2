ALTER TABLE "abc"."View" ADD COLUMN "autoExpires" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: every view that carried a deadline was an ephemeral the sweep may collect.
UPDATE "abc"."View" SET "autoExpires" = true WHERE "expiresAt" IS NOT NULL;
