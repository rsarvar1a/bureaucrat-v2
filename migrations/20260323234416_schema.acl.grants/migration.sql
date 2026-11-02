CREATE SCHEMA "acl";--> statement-breakpoint
CREATE TYPE "acl"."GrantDecision" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TABLE "acl"."AclBinding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"aclRole" uuid NOT NULL,
	"role" bigint,
	"member" bigint,
	"locationDomain" text,
	"locationId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acl"."AclGrant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"aclRole" uuid NOT NULL,
	"permission" text NOT NULL,
	"decision" "acl"."GrantDecision" NOT NULL,
	"locationDomain" text,
	"locationId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "AclGrant_aclRole_permission_locationDomain_locationId_unique" UNIQUE("aclRole","permission","locationDomain","locationId")
);
--> statement-breakpoint
CREATE TABLE "acl"."AclRole" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"guild" bigint NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "AclRole_guild_name_unique" UNIQUE("guild","name")
);
--> statement-breakpoint
ALTER TABLE "acl"."AclBinding" ADD CONSTRAINT "AclBinding_aclRole_AclRole_id_fkey" FOREIGN KEY ("aclRole") REFERENCES "acl"."AclRole"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "acl"."AclGrant" ADD CONSTRAINT "AclGrant_aclRole_AclRole_id_fkey" FOREIGN KEY ("aclRole") REFERENCES "acl"."AclRole"("id") ON DELETE CASCADE;