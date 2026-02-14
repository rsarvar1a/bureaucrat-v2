CREATE TYPE "core"."Role" AS ENUM('Player', 'Storyteller', 'Kibitzer');--> statement-breakpoint
CREATE TABLE "core"."Queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"concurrency" integer,
	"entriesPerStoryteller" integer,
	"guild" bigint NOT NULL,
	"category" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."QueueEntry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"queue" uuid NOT NULL,
	"storyteller" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"minimumStartDate" timestamp DEFAULT now() NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."QueueEntrySignup" (
	"member" bigint,
	"queueEntryId" uuid,
	"role" "core"."Role" NOT NULL,
	"message" text,
	"accepted" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "QueueEntrySignup_pkey" PRIMARY KEY("member","queueEntryId")
);
--> statement-breakpoint
ALTER TABLE "core"."QueueEntry" ADD CONSTRAINT "QueueEntry_queue_Queue_id_fkey" FOREIGN KEY ("queue") REFERENCES "core"."Queue"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."QueueEntrySignup" ADD CONSTRAINT "QueueEntrySignup_queueEntryId_QueueEntry_id_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "core"."QueueEntry"("id") ON DELETE CASCADE;