ALTER TABLE "core"."Game" ADD COLUMN "recruitedAt" timestamp;--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" ADD COLUMN "recruitRoles" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" ADD COLUMN "recruitCooldown" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Queue" ADD COLUMN "recruitRoles" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Queue" ADD COLUMN "recruitCooldown" integer;