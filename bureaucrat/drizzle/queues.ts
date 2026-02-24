import { eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Queue } from '../schema/core/queues.sql';

type InsertQueue = typeof Queue.$inferInsert;

export const insertQueue = async (data: InsertQueue) => {
  const [row] = await db.insert(Queue).values(data).returning();
  return row!;
};

export const getQueue = async (queueId: string) => {
  const [row] = await db.select().from(Queue).where(eq(Queue.id, queueId));
  return row;
};

export const updateQueue = async (queueId: string, patch: Partial<InsertQueue>) => {
  const [row] = await db.update(Queue).set(patch).where(eq(Queue.id, queueId)).returning();
  return row;
};
