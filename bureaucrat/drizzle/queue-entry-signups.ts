import { eq, and, asc } from 'drizzle-orm';
import { db } from '../utilities/db';
import { QueueEntrySignup } from '../schema/core/queues.sql';

type InsertSignup = {
  member: bigint;
  entry: string;
  role: 'Player' | 'Storyteller' | 'Kibitzer';
  message?: string;
  accepted?: boolean;
};

export const insertSignup = async (data: InsertSignup) => {
  const [row] = await db.insert(QueueEntrySignup).values(data).returning();
  return row!;
};

export const getSignupByMemberAndEntry = async (member: bigint, entryId: string) => {
  const [row] = await db
    .select()
    .from(QueueEntrySignup)
    .where(and(eq(QueueEntrySignup.member, member), eq(QueueEntrySignup.entry, entryId)));
  return row;
};

export const listSignups = async (entryId: string) => {
  return db.select().from(QueueEntrySignup).where(eq(QueueEntrySignup.entry, entryId));
};

export const listAcceptedSignups = async (entryId: string) => {
  return db
    .select()
    .from(QueueEntrySignup)
    .where(and(eq(QueueEntrySignup.entry, entryId), eq(QueueEntrySignup.accepted, true)))
    .orderBy(asc(QueueEntrySignup.createdAt));
};

export const updateSignup = async (signupId: string, patch: Partial<InsertSignup>) => {
  await db.update(QueueEntrySignup).set(patch).where(eq(QueueEntrySignup.id, signupId));
};

export const deleteSignup = async (signupId: string) => {
  await db.delete(QueueEntrySignup).where(eq(QueueEntrySignup.id, signupId));
};
