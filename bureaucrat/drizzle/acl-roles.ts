import { and, asc, eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { AclRole } from '../schema/acl/grants.sql';

type InsertAclRole = typeof AclRole.$inferInsert;

export const insertAclRole = async (data: InsertAclRole) => {
  const [row] = await db.insert(AclRole).values(data).returning();
  return row!;
};

export const getAclRole = async (roleId: string) => {
  const [row] = await db.select().from(AclRole).where(eq(AclRole.id, roleId));
  return row;
};

export const updateAclRole = async (roleId: string, patch: Partial<InsertAclRole>) => {
  const [row] = await db.update(AclRole).set(patch).where(eq(AclRole.id, roleId)).returning();
  return row;
};

export const deleteAclRole = async (roleId: string) => {
  await db.delete(AclRole).where(eq(AclRole.id, roleId));
};

export const listAclRolesByGuild = async (guildId: bigint) => {
  return db.select().from(AclRole).where(eq(AclRole.guild, guildId)).orderBy(asc(AclRole.priority));
};

export const getAclRoleByName = async (guildId: bigint, name: string) => {
  const [row] = await db
    .select()
    .from(AclRole)
    .where(and(eq(AclRole.guild, guildId), eq(AclRole.name, name)));
  return row;
};
