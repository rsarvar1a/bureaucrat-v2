import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../utilities/db';
import { AclRole, AclBinding, AclGrant } from '../schema/acl/grants.sql';

type InsertAclGrant = typeof AclGrant.$inferInsert;

/**
 * Upserts an ACL grant. If a grant already exists for the same role, permission,
 * and location scope, it is updated. Otherwise a new row is created.
 */
export const upsertAclGrant = async (data: InsertAclGrant) => {
  const [row] = await db
    .insert(AclGrant)
    .values(data)
    .onConflictDoUpdate({
      target: [AclGrant.aclRole, AclGrant.permission, AclGrant.locationDomain, AclGrant.locationId],
      set: { decision: data.decision },
    })
    .returning();
  return row!;
};

/**
 * Deletes an ACL grant by its exact scope. Used when setting a permission to "default" (inherit).
 */
export const deleteAclGrant = async (
  aclRoleId: string,
  permission: string,
  locationDomain: string | null,
  locationId: string | null,
) => {
  await db
    .delete(AclGrant)
    .where(
      and(
        eq(AclGrant.aclRole, aclRoleId),
        eq(AclGrant.permission, permission),
        locationDomain ? eq(AclGrant.locationDomain, locationDomain) : isNull(AclGrant.locationDomain),
        locationId ? eq(AclGrant.locationId, locationId) : isNull(AclGrant.locationId),
      ),
    );
};

export const listGrantsByRole = async (aclRoleId: string) => {
  return db.select().from(AclGrant).where(eq(AclGrant.aclRole, aclRoleId));
};

/**
 * Bulk-loads all ACL data for a guild in three parallel queries.
 * Used by the cache to populate the in-memory store.
 */
export const loadGuildAcl = async (guildId: bigint) => {
  const roles = await db.select().from(AclRole).where(eq(AclRole.guild, guildId));

  if (roles.length === 0) {
    return { roles, bindings: [], grants: [] };
  }

  const roleIds = roles.map((r) => r.id);

  const [bindings, grants] = await Promise.all([
    db.select().from(AclBinding).where(inArray(AclBinding.aclRole, roleIds)),
    db.select().from(AclGrant).where(inArray(AclGrant.aclRole, roleIds)),
  ]);

  return { roles, bindings, grants };
};
