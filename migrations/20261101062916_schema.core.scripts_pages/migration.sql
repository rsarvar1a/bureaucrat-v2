CREATE TABLE "core"."ScriptPage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"script" uuid NOT NULL,
	"page" integer NOT NULL,
	"png" bytea NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ScriptPage_script_page_unique" UNIQUE("script","page")
);
--> statement-breakpoint
ALTER TABLE "core"."ScriptPage" ADD CONSTRAINT "ScriptPage_script_Script_id_fkey" FOREIGN KEY ("script") REFERENCES "core"."Script"("id") ON DELETE CASCADE;