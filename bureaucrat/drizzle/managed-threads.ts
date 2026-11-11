import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../utilities/db';
import { ManagedThread } from '../schema/core/threads.sql';

type InsertManagedThread = typeof ManagedThread.$inferInsert;
type ThreadKind = InsertManagedThread['kind'];

export const insertManagedThread = async (data: InsertManagedThread) => {
  const [row] = await db.insert(ManagedThread).values(data).returning();
  return row!;
};

export const listManagedThreads = async (gameId: string, kind?: ThreadKind) =>
  db
    .select()
    .from(ManagedThread)
    .where(kind ? and(eq(ManagedThread.game, gameId), eq(ManagedThread.kind, kind)) : eq(ManagedThread.game, gameId))
    .orderBy(asc(ManagedThread.createdAt));

export const updateManagedThread = async (
  id: string,
  patch: Partial<Pick<InsertManagedThread, 'tag' | 'publishedAt'>>,
) => {
  const [row] = await db.update(ManagedThread).set(patch).where(eq(ManagedThread.id, id)).returning();
  return row;
};

export const getManagedThread = async (id: string) => {
  const [row] = await db.select().from(ManagedThread).where(eq(ManagedThread.id, id));
  return row;
};

export const getManagedThreadBySnowflake = async (thread: bigint) => {
  const [row] = await db.select().from(ManagedThread).where(eq(ManagedThread.thread, thread));
  return row;
};

export const listManagedThreadsByKinds = async (gameId: string, kinds: ThreadKind[]) =>
  kinds.length === 0
    ? []
    : db
        .select()
        .from(ManagedThread)
        .where(and(eq(ManagedThread.game, gameId), inArray(ManagedThread.kind, kinds)))
        .orderBy(asc(ManagedThread.createdAt));
