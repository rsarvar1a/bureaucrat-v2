import { eq, and, asc, count, gt, sql } from 'drizzle-orm';
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
  return db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({ max: sql<number>`coalesce(max(${QueueEntry.position}), 0)` })
      .from(QueueEntry)
      .where(eq(QueueEntry.queue, data.queue));

    const [row] = await tx
      .insert(QueueEntry)
      .values({ ...data, position: maxRow!.max + 1 })
      .returning();
    return row!;
  });
};

export const getQueueEntry = async (entryId: string) => {
  const [row] = await db.select().from(QueueEntry).where(eq(QueueEntry.id, entryId));
  return row;
};

export const listQueueEntries = async (queueId: string) => {
  return db.select().from(QueueEntry).where(eq(QueueEntry.queue, queueId)).orderBy(asc(QueueEntry.position));
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

export const bumpEntry = async (entryId: string) => {
  const entry = await getQueueEntry(entryId);
  if (!entry) return null;

  const [next] = await db
    .select()
    .from(QueueEntry)
    .where(and(eq(QueueEntry.queue, entry.queue), gt(QueueEntry.position, entry.position)))
    .orderBy(asc(QueueEntry.position))
    .limit(1);

  if (!next) return null;

  await db.update(QueueEntry).set({ position: next.position }).where(eq(QueueEntry.id, entry.id));
  await db.update(QueueEntry).set({ position: entry.position }).where(eq(QueueEntry.id, next.id));

  return { bumped: entry.id, swappedWith: next.id };
};
