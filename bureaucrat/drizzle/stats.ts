import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { ExportMember, GameExport } from '../schema/core/exports.sql';
import { Game } from '../schema/core/games.sql';
import { Participant } from '../schema/core/people.sql';
import { GameOutcome, GameWinner } from '../schema/core/results.sql';
import { GameMemberMessageStats, GameMessageStats } from '../schema/core/stats.sql';

/** Each game's largest export: a game can have several holding the same messages. */
export const listLargestExports = (guild: bigint) =>
  db
    .selectDistinctOn([GameExport.game], {
      id: GameExport.id,
      game: GameExport.game,
      messages: GameExport.messages,
      state: GameExport.state,
    })
    .from(GameExport)
    .innerJoin(Game, eq(Game.id, GameExport.game))
    .where(eq(Game.guild, guild))
    .orderBy(GameExport.game, desc(GameExport.messages), GameExport.id);

export const listStoredMessageStats = (guild: bigint) =>
  db
    .select({
      game: GameMessageStats.game,
      export: GameMessageStats.export,
      exportMessages: GameMessageStats.exportMessages,
    })
    .from(GameMessageStats)
    .innerJoin(Game, eq(Game.id, GameMessageStats.game))
    .where(eq(Game.guild, guild));

/**
 * Recounts one game from one export. Its stretch of play is what is left of its
 * human messages after splitting wherever more than two days pass between two
 * of them and keeping the largest piece, which drops setup before a long wait
 * and a hall of fame thread years later.
 */
export const recountGameMessages = (game: string, exportId: string, exportMessages: number) =>
  db.transaction(async (tx) => {
    await tx.delete(GameMessageStats).where(eq(GameMessageStats.game, game));
    await tx.execute(sql`
      WITH stepped AS (
        SELECT author,
               "createdAt" AS at,
               "createdAt" - lag("createdAt") OVER (ORDER BY "createdAt") AS gap
        FROM core."ExportMessage"
        WHERE export = ${exportId} AND NOT bot AND NOT system
      ),
      stretched AS (
        SELECT *,
               count(*) FILTER (WHERE gap > interval '2 days')
                 OVER (ORDER BY at ROWS UNBOUNDED PRECEDING) AS stretch
        FROM stepped
      ),
      sized AS (
        SELECT *, count(*) OVER (PARTITION BY stretch) AS size
        FROM stretched
      ),
      marked AS (
        SELECT *, stretch = first_value(stretch) OVER (ORDER BY size DESC, stretch) AS played
        FROM sized
      ),
      by_author AS (
        SELECT author,
               count(*)::integer AS messages,
               (count(*) FILTER (WHERE played))::integer AS played,
               min(at) FILTER (WHERE played) AS first_at,
               max(at) FILTER (WHERE played) AS last_at
        FROM marked
        GROUP BY author
      ),
      stats AS (
        INSERT INTO core."GameMessageStats"
          (game, export, "exportMessages", messages, played, threads, authors, "firstAt", "lastAt")
        SELECT ${game},
               ${exportId},
               ${exportMessages},
               coalesce(sum(messages), 0),
               coalesce(sum(played), 0),
               (SELECT count(*) FROM core."ExportChannel" WHERE export = ${exportId} AND kind <> 'channel'),
               count(*),
               min(first_at),
               max(last_at)
        FROM by_author
        RETURNING id
      )
      INSERT INTO core."GameMemberMessageStats" (stats, member, messages, played)
      SELECT stats.id, by_author.author, by_author.messages, by_author.played
      FROM by_author CROSS JOIN stats
    `);
  });

export const listGameMessageStats = (guild: bigint) =>
  db
    .select({
      game: GameMessageStats.game,
      name: Game.name,
      winner: sql<string | null>`(
        SELECT string_agg(o.winner::text, ' / ' ORDER BY o.position)
        FROM core."GameOutcome" o
        WHERE o.game = ${GameMessageStats.game}
      )`,
      messages: GameMessageStats.messages,
      threads: GameMessageStats.threads,
      authors: GameMessageStats.authors,
      firstAt: GameMessageStats.firstAt,
      lastAt: GameMessageStats.lastAt,
    })
    .from(GameMessageStats)
    .innerJoin(Game, eq(Game.id, GameMessageStats.game))
    .where(eq(Game.guild, guild));

/** Each author's count in each game, with the role they held in it as of now. */
export const listMemberMessageStats = (guild: bigint) =>
  db
    .select({
      game: GameMessageStats.game,
      member: GameMemberMessageStats.member,
      played: GameMemberMessageStats.played,
      role: Participant.role,
      firstAt: GameMessageStats.firstAt,
      lastAt: GameMessageStats.lastAt,
    })
    .from(GameMemberMessageStats)
    .innerJoin(GameMessageStats, eq(GameMessageStats.id, GameMemberMessageStats.stats))
    .innerJoin(Game, eq(Game.id, GameMessageStats.game))
    .leftJoin(
      Participant,
      and(eq(Participant.game, GameMessageStats.game), eq(Participant.member, GameMemberMessageStats.member)),
    )
    .where(eq(Game.guild, guild));

/** One row per Participant and result of every game in the guild with a result. */
export const listPlayerResults = async (guild: bigint) => {
  const rows = await db
    .select({
      member: Participant.member,
      role: Participant.role,
      winner: GameOutcome.winner,
      winnerRow: GameWinner.id,
    })
    .from(Participant)
    .innerJoin(Game, eq(Game.id, Participant.game))
    .innerJoin(GameOutcome, eq(GameOutcome.game, Participant.game))
    .leftJoin(GameWinner, and(eq(GameWinner.outcome, GameOutcome.id), eq(GameWinner.member, Participant.member)))
    .where(eq(Game.guild, guild));
  return rows.map(({ winnerRow, ...row }) => ({ ...row, won: winnerRow !== null }));
};

/** The newest display name an export recorded for each member, for people no longer in the server. */
export const listExportedNames = async (members: bigint[]) => {
  if (members.length === 0) return [];
  return db
    .selectDistinctOn([ExportMember.member], { member: ExportMember.member, displayName: ExportMember.displayName })
    .from(ExportMember)
    .innerJoin(GameExport, eq(GameExport.id, ExportMember.export))
    .where(inArray(ExportMember.member, members))
    .orderBy(ExportMember.member, desc(GameExport.updatedAt));
};
