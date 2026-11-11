import { and, asc, count, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Game } from '../schema/core/games.sql';
import { ManagedThread } from '../schema/core/threads.sql';
import { Participant } from '../schema/core/people.sql';
import { Seating } from '../schema/core/seating.sql';
import { GameOutcome, GameWinner } from '../schema/core/results.sql';

type InsertGame = typeof Game.$inferInsert;

export const insertGame = async (data: InsertGame) => {
  const [row] = await db.insert(Game).values(data).returning();
  return row!;
};

export const getGame = async (gameId: string) => {
  const [row] = await db.select().from(Game).where(eq(Game.id, gameId));
  return row;
};

/**
 * The game a channel belongs to: its own channel, or one of its managed
 * threads. Lets a command run from GAME CONFIG find its game without asking
 * Discord for the thread's parent.
 */
export const getGameByChannel = async (channelId: bigint) => {
  const [row] = await db
    .select({ game: Game })
    .from(Game)
    .leftJoin(ManagedThread, eq(ManagedThread.game, Game.id))
    .where(or(eq(Game.channel, channelId), eq(ManagedThread.thread, channelId)))
    .limit(1);
  return row?.game;
};

export const updateGame = async (gameId: string, patch: Partial<InsertGame>) => {
  const [row] = await db.update(Game).set(patch).where(eq(Game.id, gameId)).returning();
  return row;
};

export const deleteGame = async (gameId: string) => {
  await db.delete(Game).where(eq(Game.id, gameId));
};

/** Every game not yet completed, in any server. */
export const listRunningGames = () => db.select().from(Game).where(ne(Game.state, 'completed'));

/** Games on a queue that still occupy a slot: anything not yet completed. */
export const countActiveGames = async (queueId: string) => {
  const [row] = await db
    .select({ count: count() })
    .from(Game)
    .where(and(eq(Game.queue, queueId), ne(Game.state, 'completed')));
  return row!.count;
};

export const listGamesByMemberInGuild = async (member: bigint, guildId: bigint) =>
  db
    .select({
      id: Game.id,
      name: Game.name,
      state: Game.state,
      channel: Game.channel,
      role: Participant.role,
      createdAt: Game.createdAt,
    })
    .from(Participant)
    .innerJoin(Game, eq(Participant.game, Game.id))
    .where(and(eq(Participant.member, member), eq(Game.guild, guildId)))
    .orderBy(desc(Game.createdAt));

/**
 * Every game a member is or was in, with what the record needs: their role,
 * their seat's true role and alignment if they had one, and each of the game's
 * results with whether they were declared a winner of it. The seat and the
 * results are both optional (a Storyteller has no seat; a game still running
 * has no result).
 */
export const listGameRecordsByMember = async (member: bigint, guildId: bigint) => {
  const games = await db
    .select({
      id: Game.id,
      name: Game.name,
      state: Game.state,
      channel: Game.channel,
      endedAt: Game.endedAt,
      createdAt: Game.createdAt,
      role: Participant.role,
      trueRole: Seating.trueRole,
      trueAlignment: Seating.trueAlignment,
    })
    .from(Participant)
    .innerJoin(Game, eq(Participant.game, Game.id))
    .leftJoin(Seating, eq(Seating.player, Participant.id))
    .where(and(eq(Participant.member, member), eq(Game.guild, guildId)))
    .orderBy(desc(Game.createdAt));

  const results =
    games.length === 0
      ? []
      : await db
          .select({
            game: GameOutcome.game,
            position: GameOutcome.position,
            winner: GameOutcome.winner,
            winnerId: GameWinner.id,
            wonAs: GameWinner.alignment,
          })
          .from(GameOutcome)
          .leftJoin(GameWinner, and(eq(GameWinner.outcome, GameOutcome.id), eq(GameWinner.member, member)))
          .where(
            inArray(
              GameOutcome.game,
              games.map((g) => g.id),
            ),
          )
          .orderBy(asc(GameOutcome.position));

  return games.map((game) => ({
    ...game,
    results: results
      .filter((r) => r.game === game.id)
      .map((r) => ({ position: r.position, winner: r.winner, wonAs: r.wonAs, won: r.winnerId !== null })),
  }));
};
