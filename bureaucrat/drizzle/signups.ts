import { and, asc, eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Signup } from '../schema/core/people.sql';

type InsertSignup = typeof Signup.$inferInsert;
type SignupRole = InsertSignup['role'];

export const insertSignup = async (row: InsertSignup) => {
  const [inserted] = await db.insert(Signup).values(row).returning();
  return inserted!;
};

export const insertSignups = async (rows: InsertSignup[]) => {
  if (rows.length === 0) return [];
  return db.insert(Signup).values(rows).onConflictDoNothing().returning();
};

export const getSignup = async (id: string) => {
  const [row] = await db.select().from(Signup).where(eq(Signup.id, id));
  return row;
};

export const getSignupByMember = async (gameId: string, member: bigint) => {
  const [row] = await db
    .select()
    .from(Signup)
    .where(and(eq(Signup.game, gameId), eq(Signup.member, member)));
  return row;
};

export const listSignups = async (gameId: string, role?: SignupRole) =>
  db
    .select()
    .from(Signup)
    .where(role ? and(eq(Signup.game, gameId), eq(Signup.role, role)) : eq(Signup.game, gameId))
    .orderBy(asc(Signup.createdAt));

export const deleteSignup = async (id: string) => {
  await db.delete(Signup).where(eq(Signup.id, id));
};
