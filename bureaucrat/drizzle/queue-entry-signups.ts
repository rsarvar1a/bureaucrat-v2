import { eq, and, asc } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Queue, QueueEntry, QueueEntrySignup } from '../schema/core/queues.sql';

type InsertSignup = {
  member: bigint;
  entry: string;
  role: 'Player' | 'Storyteller' | 'Kibitzer';
  message?: string;
  accepted?: boolean | null;
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
  const [row] = await db.update(QueueEntrySignup).set(patch).where(eq(QueueEntrySignup.id, signupId)).returning();
  return row;
};

export const deleteSignup = async (signupId: string) => {
  const [row] = await db.delete(QueueEntrySignup).where(eq(QueueEntrySignup.id, signupId)).returning();
  return row;
};

export const listSignupsByMemberInGuild = async (member: bigint, guildId: bigint) => {
  return db
    .select({
      entryTitle: QueueEntry.title,
      queueName: Queue.name,
      role: QueueEntrySignup.role,
      message: QueueEntrySignup.message,
      accepted: QueueEntrySignup.accepted,
    })
    .from(QueueEntrySignup)
    .innerJoin(QueueEntry, eq(QueueEntrySignup.entry, QueueEntry.id))
    .innerJoin(Queue, eq(QueueEntry.queue, Queue.id))
    .where(and(eq(QueueEntrySignup.member, member), eq(Queue.guild, guildId)))
    .orderBy(asc(Queue.name), asc(QueueEntry.position));
};
