ALTER TABLE "core"."GuildSettings" ADD COLUMN "managerRoles" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" ADD COLUMN "moderatorRoles" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" ADD COLUMN "storytellerRoles" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."GuildSettings" ADD COLUMN "playerRoles" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Queue" ADD COLUMN "storytellerRoles" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."Queue" ADD COLUMN "playerRoles" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
-- The free-form ACL gives way to archetypes. Discord roles bound server-wide to the seeded
-- `admin` and `moderator` ACL roles carry over as Managers and Moderators; member bindings,
-- location-scoped bindings and any other ACL role have no archetype and are dropped.
INSERT INTO "core"."GuildSettings" ("guild", "managerRoles", "moderatorRoles")
SELECT r."guild",
  COALESCE(array_agg(DISTINCT b."role") FILTER (WHERE r."name" = 'admin'), '{}'),
  COALESCE(array_agg(DISTINCT b."role") FILTER (WHERE r."name" = 'moderator'), '{}')
FROM "acl"."AclBinding" b JOIN "acl"."AclRole" r ON r."id" = b."aclRole"
WHERE b."role" IS NOT NULL AND b."locationDomain" IS NULL AND r."name" IN ('admin', 'moderator')
GROUP BY r."guild"
ON CONFLICT ("guild") DO UPDATE SET
  "managerRoles" = EXCLUDED."managerRoles",
  "moderatorRoles" = EXCLUDED."moderatorRoles";--> statement-breakpoint
ALTER TABLE "acl"."AclBinding" DROP CONSTRAINT "AclBinding_aclRole_AclRole_id_fkey";--> statement-breakpoint
ALTER TABLE "acl"."AclGrant" DROP CONSTRAINT "AclGrant_aclRole_AclRole_id_fkey";--> statement-breakpoint
DROP TABLE "acl"."AclBinding";--> statement-breakpoint
DROP TABLE "acl"."AclGrant";--> statement-breakpoint
DROP TABLE "acl"."AclRole";--> statement-breakpoint
DROP TYPE "acl"."GrantDecision";--> statement-breakpoint
DROP SCHEMA "acl";
