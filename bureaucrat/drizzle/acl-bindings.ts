import { eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { AclBinding } from '../schema/acl/grants.sql';

type InsertAclBinding = typeof AclBinding.$inferInsert;

export const insertAclBinding = async (data: InsertAclBinding) => {
  const [row] = await db.insert(AclBinding).values(data).returning();
  return row!;
};

export const deleteAclBinding = async (bindingId: string) => {
  await db.delete(AclBinding).where(eq(AclBinding.id, bindingId));
};

export const listBindingsByRole = async (aclRoleId: string) => {
  return db.select().from(AclBinding).where(eq(AclBinding.aclRole, aclRoleId));
};
