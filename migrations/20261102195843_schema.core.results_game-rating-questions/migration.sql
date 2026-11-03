ALTER TABLE "core"."GameRating" ADD COLUMN "scriptNote" text;--> statement-breakpoint
ALTER TABLE "core"."GameRating" ADD COLUMN "decisionsNote" text;--> statement-breakpoint
ALTER TABLE "core"."GameRating" ADD COLUMN "atmosphere" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GameRating" ADD COLUMN "atmosphereNote" text;--> statement-breakpoint
ALTER TABLE "core"."GameRating" ADD COLUMN "overall" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GameRating" DROP COLUMN "storytelling";