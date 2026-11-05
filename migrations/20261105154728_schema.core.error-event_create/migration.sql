CREATE TABLE "core"."ErrorEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"at" timestamp DEFAULT now() NOT NULL,
	"area" text NOT NULL,
	"operation" text NOT NULL,
	"outcome" text NOT NULL,
	"kind" text NOT NULL,
	"code" text,
	"status" integer,
	"route" text,
	"message" text NOT NULL,
	"game" uuid,
	"export" uuid,
	"guild" bigint,
	"channel" bigint,
	"detail" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ErrorEvent_at_index" ON "core"."ErrorEvent" ("at");--> statement-breakpoint
CREATE INDEX "ErrorEvent_area_operation_at_index" ON "core"."ErrorEvent" ("area","operation","at");