CREATE TABLE "core"."GuildSettings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"guild" bigint NOT NULL UNIQUE,
	"archive" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."Queue" ADD COLUMN "archive" bigint;