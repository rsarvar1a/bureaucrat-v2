CREATE TYPE "core"."ExportChannelKind" AS ENUM('channel', 'public', 'private');--> statement-breakpoint
CREATE TYPE "core"."ExportState" AS ENUM('reading', 'read', 'copying', 'copied', 'failed');--> statement-breakpoint
CREATE TABLE "core"."ExportChannel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"export" uuid NOT NULL,
	"channel" bigint NOT NULL,
	"kind" "core"."ExportChannelKind" NOT NULL,
	"name" text NOT NULL,
	"parent" bigint,
	"createdAt" timestamp NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"readDone" boolean DEFAULT false NOT NULL,
	"copiedTo" bigint,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ExportChannel_export_channel_unique" UNIQUE("export","channel")
);
--> statement-breakpoint
CREATE TABLE "core"."ExportMember" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"export" uuid NOT NULL,
	"member" bigint NOT NULL,
	"displayName" text NOT NULL,
	"username" text NOT NULL,
	"avatar" text,
	"bot" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ExportMember_export_member_unique" UNIQUE("export","member")
);
--> statement-breakpoint
CREATE TABLE "core"."ExportMessage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"export" uuid NOT NULL,
	"channel" bigint NOT NULL,
	"message" bigint NOT NULL,
	"author" bigint NOT NULL,
	"bot" boolean DEFAULT false NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"createdAt" timestamp NOT NULL,
	"editedAt" timestamp,
	"pinned" boolean DEFAULT false NOT NULL,
	"replyTo" bigint,
	"attachments" jsonb DEFAULT '[]' NOT NULL,
	"embeds" jsonb DEFAULT '[]' NOT NULL,
	"reactions" jsonb DEFAULT '[]' NOT NULL,
	"components" jsonb,
	"extras" jsonb DEFAULT '{}' NOT NULL,
	"copiedTo" bigint,
	CONSTRAINT "ExportMessage_export_message_unique" UNIQUE("export","message")
);
--> statement-breakpoint
CREATE TABLE "core"."GameExport" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game" uuid NOT NULL UNIQUE,
	"state" "core"."ExportState" DEFAULT 'reading'::"core"."ExportState" NOT NULL,
	"copy" boolean DEFAULT false NOT NULL,
	"guild" bigint,
	"channel" bigint,
	"webhook" bigint,
	"roles" jsonb DEFAULT '{}' NOT NULL,
	"channels" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"copied" integer DEFAULT 0 NOT NULL,
	"unread" jsonb DEFAULT '[]' NOT NULL,
	"error" text,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" ADD COLUMN "offsiteGuild" bigint;--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" ADD COLUMN "offsiteCategory" bigint;--> statement-breakpoint
CREATE INDEX "ExportMessage_export_channel_message_index" ON "core"."ExportMessage" ("export","channel","message");--> statement-breakpoint
ALTER TABLE "core"."ExportChannel" ADD CONSTRAINT "ExportChannel_export_GameExport_id_fkey" FOREIGN KEY ("export") REFERENCES "core"."GameExport"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."ExportMember" ADD CONSTRAINT "ExportMember_export_GameExport_id_fkey" FOREIGN KEY ("export") REFERENCES "core"."GameExport"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."ExportMessage" ADD CONSTRAINT "ExportMessage_export_GameExport_id_fkey" FOREIGN KEY ("export") REFERENCES "core"."GameExport"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."GameExport" ADD CONSTRAINT "GameExport_game_Game_id_fkey" FOREIGN KEY ("game") REFERENCES "core"."Game"("id") ON DELETE CASCADE;