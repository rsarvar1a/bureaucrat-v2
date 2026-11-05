-- Two steps: a column added with DEFAULT now() fills every existing row with
-- the migration's time, which would read as one enormous burst of reading.
-- Rows read before this stay null; new ones take the default.
ALTER TABLE "core"."ExportMessage" ADD COLUMN "readAt" timestamp;--> statement-breakpoint
ALTER TABLE "core"."ExportMessage" ALTER COLUMN "readAt" SET DEFAULT now();
