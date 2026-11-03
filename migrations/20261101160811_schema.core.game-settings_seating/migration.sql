ALTER TABLE "core"."GameSettings" ADD COLUMN "seatingThread" text;--> statement-breakpoint
ALTER TABLE "core"."GameSettings" ADD COLUMN "exposeRoles" boolean DEFAULT false NOT NULL;