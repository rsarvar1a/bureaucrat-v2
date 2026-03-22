import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Queue } from '../schema/core/queues.sql';
import { View } from '../schema/abc/views.sql';

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

export const deleteQueue = async (queueId: string) => {
  await db.delete(Queue).where(eq(Queue.id, queueId));
};

export const listQueuesByGuild = async (guildId: bigint) => {
  return db
    .select({
      id: Queue.id,
      name: Queue.name,
      description: Queue.description,
      channel: View.channel,
      message: View.message,
    })
    .from(Queue)
    .leftJoin(View, and(sql`${View.entityId} = ${Queue.id}::text`, eq(View.route, 'queue')))
    .where(eq(Queue.guild, guildId))
    .orderBy(asc(Queue.name));
};
