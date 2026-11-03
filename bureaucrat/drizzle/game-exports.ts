import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { ExportChannel, ExportMember, ExportMessage, GameExport } from '../schema/core/exports.sql';

export type GameExportRow = typeof GameExport.$inferSelect;
export type ExportChannelRow = typeof ExportChannel.$inferSelect;
export type ExportMessageRow = typeof ExportMessage.$inferSelect;
export type ExportMemberRow = typeof ExportMember.$inferSelect;

type InsertExport = typeof GameExport.$inferInsert;
type InsertChannel = typeof ExportChannel.$inferInsert;
type InsertMessage = typeof ExportMessage.$inferInsert;
type InsertMember = typeof ExportMember.$inferInsert;

export type UpdateExport = Partial<Omit<InsertExport, 'id' | 'game' | 'createdAt'>>;

export const getExport = async (id: string): Promise<GameExportRow | undefined> => {
  const [row] = await db.select().from(GameExport).where(eq(GameExport.id, id));
  return row;
};

export const getExportOfGame = async (gameId: string): Promise<GameExportRow | undefined> => {
  const [row] = await db.select().from(GameExport).where(eq(GameExport.game, gameId));
  return row;
};

export const insertExport = async (row: InsertExport): Promise<GameExportRow> => {
  const [inserted] = await db.insert(GameExport).values(row).returning();
  return inserted!;
};

export const updateExport = async (id: string, patch: UpdateExport): Promise<GameExportRow | undefined> => {
  const [row] = await db
    .update(GameExport)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(GameExport.id, id))
    .returning();
  return row;
};

export const deleteExport = async (id: string): Promise<void> => {
  await db.delete(GameExport).where(eq(GameExport.id, id));
};

/** Exports with work left: the engine claims these after a restart as well as on a fresh start. */
export const listClaimableExports = async (): Promise<GameExportRow[]> =>
  db
    .select()
    .from(GameExport)
    .where(inArray(GameExport.state, ['reading', 'copying']))
    .orderBy(asc(GameExport.createdAt));

/** A channel seen again keeps its row; its name and flags follow the source. */
export const upsertChannels = async (rows: InsertChannel[]): Promise<void> => {
  if (rows.length === 0) return;
  await db
    .insert(ExportChannel)
    .values(rows)
    .onConflictDoUpdate({
      target: [ExportChannel.export, ExportChannel.channel],
      set: {
        name: sql`excluded."name"`,
        archived: sql`excluded."archived"`,
        locked: sql`excluded."locked"`,
        updatedAt: new Date(),
      },
    });
};

/** The source channel first, then its threads in the order they were made. */
export const listChannels = async (exportId: string): Promise<ExportChannelRow[]> =>
  db
    .select()
    .from(ExportChannel)
    .where(eq(ExportChannel.export, exportId))
    .orderBy(asc(ExportChannel.parent), asc(ExportChannel.createdAt));

export const updateChannel = async (
  id: string,
  patch: Partial<Pick<InsertChannel, 'readDone' | 'copiedTo' | 'archived'>>,
): Promise<void> => {
  await db
    .update(ExportChannel)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(ExportChannel.id, id));
};

/** A message read twice (a resumed read overlaps by one page) is stored once. */
export const insertMessages = async (rows: InsertMessage[]): Promise<void> => {
  if (rows.length === 0) return;
  await db.insert(ExportMessage).values(rows).onConflictDoNothing();
};

/** Where a resumed read of a channel carries on from: before its oldest stored message. */
export const oldestMessageOf = async (exportId: string, channel: bigint): Promise<bigint | null> => {
  const [row] = await db
    .select({ message: sql<bigint>`min(${ExportMessage.message})` })
    .from(ExportMessage)
    .where(and(eq(ExportMessage.export, exportId), eq(ExportMessage.channel, channel)));
  return row?.message ?? null;
};

export const countMessages = async (exportId: string): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ExportMessage)
    .where(eq(ExportMessage.export, exportId));
  return row?.count ?? 0;
};

export const countCopied = async (exportId: string): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ExportMessage)
    .where(and(eq(ExportMessage.export, exportId), sql`${ExportMessage.copiedTo} is not null`));
  return row?.count ?? 0;
};

/** The messages of a channel still to copy, oldest first. */
export const listUncopiedMessages = async (exportId: string, channel: bigint): Promise<ExportMessageRow[]> =>
  db
    .select()
    .from(ExportMessage)
    .where(and(eq(ExportMessage.export, exportId), eq(ExportMessage.channel, channel), isNull(ExportMessage.copiedTo)))
    .orderBy(asc(ExportMessage.message));

export const setMessageCopy = async (id: string, copiedTo: bigint): Promise<void> => {
  await db.update(ExportMessage).set({ copiedTo }).where(eq(ExportMessage.id, id));
};

/** The reactions come after the insert, one request per emoji, so they are written by source id. */
export const setReactions = async (
  exportId: string,
  message: bigint,
  reactions: ExportMessageRow['reactions'],
): Promise<void> => {
  await db
    .update(ExportMessage)
    .set({ reactions })
    .where(and(eq(ExportMessage.export, exportId), eq(ExportMessage.message, message)));
};

/** The time of the last message copied in a channel, so a resumed copy knows whether the day changed. */
export const lastCopiedTimeOf = async (exportId: string, channel: bigint): Promise<Date | null> => {
  const [row] = await db
    .select({ createdAt: ExportMessage.createdAt })
    .from(ExportMessage)
    .where(
      and(
        eq(ExportMessage.export, exportId),
        eq(ExportMessage.channel, channel),
        sql`${ExportMessage.copiedTo} is not null`,
      ),
    )
    .orderBy(desc(ExportMessage.message))
    .limit(1);
  return row?.createdAt ?? null;
};

/** The parent of a reply as the renderer wants it: who wrote it, what it said, what it became. */
export const parentOf = async (
  exportId: string,
  message: bigint,
): Promise<Pick<ExportMessageRow, 'author' | 'content' | 'copiedTo'> | null> => {
  const [row] = await db
    .select({ author: ExportMessage.author, content: ExportMessage.content, copiedTo: ExportMessage.copiedTo })
    .from(ExportMessage)
    .where(and(eq(ExportMessage.export, exportId), eq(ExportMessage.message, message)));
  return row ?? null;
};

/** What a source message became, for a reply's jump link; null until it is copied. */
export const copiedIdOf = async (exportId: string, message: bigint): Promise<bigint | null> => {
  const [row] = await db
    .select({ copiedTo: ExportMessage.copiedTo })
    .from(ExportMessage)
    .where(and(eq(ExportMessage.export, exportId), eq(ExportMessage.message, message)));
  return row?.copiedTo ?? null;
};

export const upsertMembers = async (rows: InsertMember[]): Promise<void> => {
  if (rows.length === 0) return;
  await db
    .insert(ExportMember)
    .values(rows)
    .onConflictDoUpdate({
      target: [ExportMember.export, ExportMember.member],
      set: {
        displayName: sql`excluded."displayName"`,
        username: sql`excluded."username"`,
        avatar: sql`excluded."avatar"`,
        bot: sql`excluded."bot"`,
      },
    });
};

export const listMembers = async (exportId: string): Promise<ExportMemberRow[]> =>
  db.select().from(ExportMember).where(eq(ExportMember.export, exportId));
