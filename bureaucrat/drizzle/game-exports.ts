import { and, asc, desc, eq, exists, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { ExportChannel, ExportMember, ExportMessage, GameExport } from '../schema/core/exports.sql';
import { Game } from '../schema/core/games.sql';

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

/** The game's export to one destination, or its read-only export when `destination` is null. */
export const getExportOf = async (gameId: string, destination: string | null): Promise<GameExportRow | undefined> => {
  const [row] = await db
    .select()
    .from(GameExport)
    .where(
      and(
        eq(GameExport.game, gameId),
        destination === null ? isNull(GameExport.destination) : eq(GameExport.destination, destination),
      ),
    );
  return row;
};

/** Every export of the game, one per destination, the oldest first. */
export const listExportsOfGame = async (gameId: string): Promise<GameExportRow[]> =>
  db.select().from(GameExport).where(eq(GameExport.game, gameId)).orderBy(asc(GameExport.createdAt));

/** Another export of the game whose read is finished, to clone rather than read Discord again. */
export const readSiblingOf = async (exp: GameExportRow): Promise<GameExportRow | undefined> => {
  const [row] = await db
    .select()
    .from(GameExport)
    .where(
      and(
        eq(GameExport.game, exp.game),
        ne(GameExport.id, exp.id),
        inArray(GameExport.state, ['read', 'copying', 'copied']),
      ),
    )
    .orderBy(desc(GameExport.privateListed), asc(GameExport.createdAt))
    .limit(1);
  return row;
};

/**
 * Copies one export's read into another: its channels, messages and members
 * as read, none of them copied anywhere yet, and the counts. The target is
 * then as if it had read Discord itself.
 */
export const cloneRead = async (from: GameExportRow, to: GameExportRow): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO "core"."ExportChannel"
        ("export", "channel", "kind", "name", "parent", "createdAt", "archived", "locked", "readDone")
      SELECT ${to.id}, "channel", "kind", "name", "parent", "createdAt", "archived", "locked", "readDone"
      FROM "core"."ExportChannel" WHERE "export" = ${from.id}
      ON CONFLICT DO NOTHING`);
    await tx.execute(sql`
      INSERT INTO "core"."ExportMessage"
        ("export", "channel", "message", "author", "bot", "system", "content", "createdAt", "editedAt",
         "pinned", "replyTo", "attachments", "embeds", "reactions", "components", "extras", "readAt")
      SELECT ${to.id}, "channel", "message", "author", "bot", "system", "content", "createdAt", "editedAt",
        "pinned", "replyTo", "attachments", "embeds", "reactions", "components", "extras", NULL
      FROM "core"."ExportMessage" WHERE "export" = ${from.id}
      ON CONFLICT DO NOTHING`);
    await tx.execute(sql`
      INSERT INTO "core"."ExportMember" ("export", "member", "displayName", "username", "avatar", "bot")
      SELECT ${to.id}, "member", "displayName", "username", "avatar", "bot"
      FROM "core"."ExportMember" WHERE "export" = ${from.id}
      ON CONFLICT DO NOTHING`);
    await tx
      .update(GameExport)
      .set({
        channels: from.channels,
        messages: from.messages,
        unread: from.unread,
        roles: from.roles,
        privateListed: from.privateListed,
        state: to.copy ? 'copying' : 'read',
        updatedAt: new Date(),
      })
      .where(eq(GameExport.id, to.id));
  });
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

type ChannelKind = ExportChannelRow['kind'];

/** How many messages the export holds in channels of these kinds; what a copy that takes only those has to send. */
export const countMessagesOfKinds = async (exportId: string, kinds: ChannelKind[]): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ExportMessage)
    .innerJoin(
      ExportChannel,
      and(eq(ExportChannel.export, ExportMessage.export), eq(ExportChannel.channel, ExportMessage.channel)),
    )
    .where(and(eq(ExportMessage.export, exportId), inArray(ExportChannel.kind, kinds)));
  return row?.count ?? 0;
};

/**
 * A guild's finished copies that may lack private threads: what a server
 * that turns private threads on afterwards owes its archive. Either one was
 * read and left uncopied, or the read never saw the full list of them
 * (`privateListed`), so there may be some it does not know of.
 */
export const listCopiedExportsOwedPrivate = async (guild: bigint): Promise<GameExportRow[]> => {
  const rows = await db
    .select({ exp: GameExport })
    .from(GameExport)
    .innerJoin(Game, eq(Game.id, GameExport.game))
    .where(
      and(
        eq(Game.guild, guild),
        eq(GameExport.state, 'copied'),
        or(
          eq(GameExport.privateListed, false),
          exists(
            db
              .select({ one: sql`1` })
              .from(ExportChannel)
              .where(
                and(
                  eq(ExportChannel.export, GameExport.id),
                  eq(ExportChannel.kind, 'private'),
                  isNull(ExportChannel.copiedTo),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(GameExport.createdAt));
  return rows.map((r) => r.exp);
};
