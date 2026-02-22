CREATE SCHEMA "abc"; --> statement-breakpoint
CREATE TABLE "abc"."Subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"view" uuid NOT NULL,
	"contextLabel" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Subscription_view_contextLabel_unique" UNIQUE("view","contextLabel")
);
--> statement-breakpoint
CREATE TABLE "abc"."View" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"route" text NOT NULL,
	"state" jsonb,
	"entityId" text,
	"visibility" text NOT NULL,
	"expiresAt" timestamp,
	"webhookToken" text,
	"channel" bigint NOT NULL,
	"message" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abc"."Subscription" ADD CONSTRAINT "Subscription_view_View_id_fkey" FOREIGN KEY ("view") REFERENCES "abc"."View"("id") ON DELETE CASCADE;