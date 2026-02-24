import { eq, and, asc, count } from 'drizzle-orm';
import { db } from '../utilities/db';
import { QueueEntry } from '../schema/core/queues.sql';

type InsertQueueEntry = {
  queue: string;
  storyteller: bigint;
  title: string;
  description: string;
  public?: boolean;
  minimumStartDate?: Date;
};

type UpdateQueueEntry = Partial<Omit<InsertQueueEntry, 'minimumStartDate'>> & {
  minimumStartDate?: Date | null;
};

export const insertQueueEntry = async (data: InsertQueueEntry) => {
  const [row] = await db.insert(QueueEntry).values(data).returning();
  return row!;
};

export const getQueueEntry = async (entryId: string) => {
  const [row] = await db.select().from(QueueEntry).where(eq(QueueEntry.id, entryId));
  return row;
};

export const listQueueEntries = async (queueId: string) => {
  return db.select().from(QueueEntry).where(eq(QueueEntry.queue, queueId)).orderBy(asc(QueueEntry.createdAt));
};

export const updateQueueEntry = async (entryId: string, patch: UpdateQueueEntry) => {
  const [row] = await db.update(QueueEntry).set(patch).where(eq(QueueEntry.id, entryId)).returning();
  return row;
};

export const countEntriesByStoryteller = async (queueId: string, storyteller: bigint) => {
  const [row] = await db
    .select({ count: count() })
    .from(QueueEntry)
    .where(and(eq(QueueEntry.queue, queueId), eq(QueueEntry.storyteller, storyteller)));
  return row!.count;
};

export const deleteQueueEntry = async (entryId: string) => {
  const [row] = await db.delete(QueueEntry).where(eq(QueueEntry.id, entryId)).returning();
  return row;
};
