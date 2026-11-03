ALTER TABLE "core"."GameSettings" ADD COLUMN "whisperThread" text DEFAULT 'Whispers';--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ALTER COLUMN "nominationThread" SET DEFAULT 'Nominations';--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ALTER COLUMN "scriptThread" SET DEFAULT 'Script & Seating';--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ALTER COLUMN "seatingThread" SET DEFAULT 'Script & Seating';