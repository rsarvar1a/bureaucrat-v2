ALTER TABLE "core"."Script" ADD COLUMN "entry" uuid;--> statement-breakpoint
ALTER TABLE "core"."Script" ALTER COLUMN "game" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Script" ADD CONSTRAINT "Script_entry_key" UNIQUE("entry");--> statement-breakpoint
ALTER TABLE "core"."Script" ADD CONSTRAINT "Script_entry_QueueEntry_id_fkey" FOREIGN KEY ("entry") REFERENCES "core"."QueueEntry"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."Script" ADD CONSTRAINT "Script_one_owner" CHECK (("game" IS NULL) <> ("entry" IS NULL));