import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Game, GamePhase, GameSettings } from '../schema/core/games.sql';

/** A day or night by number, free of any row identity. */
export type PhaseRef = { phase: 'night' | 'day'; on: number };

/** Night 1, Day 1, Night 2, ... in play order. */
export const listPhases = async (gameId: string) =>
  db.select().from(GamePhase).where(eq(GamePhase.game, gameId)).orderBy(asc(GamePhase.on), asc(GamePhase.phase));

/**
 * The phase the game is in: the latest by (on, phase).
 *
 * `Phase` is declared `['night', 'day']`, and Postgres orders an enum by its
 * declaration order, so within a number the day sorts after the night.
 */
export const currentPhase = async (gameId: string) => {
  const [row] = await db
    .select()
    .from(GamePhase)
    .where(eq(GamePhase.game, gameId))
    .orderBy(desc(GamePhase.on), desc(GamePhase.phase))
    .limit(1);
  return row;
};

const key = (ref: PhaseRef) => `${ref.phase}:${ref.on}`;

/**
 * Makes the game's phases exactly `wanted`: inserts the ones missing, deletes
 * the ones beyond. The caller decides what the sequence up to a target looks
 * like; this only reconciles rows against it.
 */
export const setPhases = async (gameId: string, wanted: PhaseRef[]) => {
  await db.transaction(async (tx) => {
    const have = await tx.select().from(GamePhase).where(eq(GamePhase.game, gameId));
    const keep = new Set(wanted.map(key));

    const surplus = have.filter((row) => !keep.has(key(row))).map((row) => row.id);
    if (surplus.length > 0) {
      await tx.delete(GamePhase).where(and(eq(GamePhase.game, gameId), inArray(GamePhase.id, surplus)));
    }

    const present = new Set(have.map(key));
    const missing = wanted.filter((ref) => !present.has(key(ref)));
    if (missing.length > 0) {
      await tx.insert(GamePhase).values(missing.map((ref) => ({ game: gameId, ...ref })));
    }
  });
};

export const getPhase = async (id: string) => {
  const [row] = await db.select().from(GamePhase).where(eq(GamePhase.id, id));
  return row;
};

/**
 * Marks the day's nominations open, once: the predicate makes the timer and
 * the Storyteller's button agree on who got there first. True when this call
 * did it.
 */
export const claimNominationsOpen = async (phaseId: string): Promise<boolean> => {
  const rows = await db
    .update(GamePhase)
    .set({ nominationsOpenedAt: new Date() })
    .where(and(eq(GamePhase.id, phaseId), isNull(GamePhase.nominationsOpenedAt)))
    .returning({ id: GamePhase.id });
  return rows.length > 0;
};

export const closeNominations = async (phaseId: string) => {
  const [row] = await db
    .update(GamePhase)
    .set({ nominationsClosedAt: new Date() })
    .where(eq(GamePhase.id, phaseId))
    .returning();
  return row;
};

export const reopenNominations = async (phaseId: string) => {
  const [row] = await db
    .update(GamePhase)
    .set({ nominationsClosedAt: null })
    .where(eq(GamePhase.id, phaseId))
    .returning();
  return row;
};

/** The game's days whose nominations are open: opened and not yet closed. */
export const listOpenDays = async (gameId: string) =>
  db
    .select()
    .from(GamePhase)
    .where(
      and(eq(GamePhase.game, gameId), isNotNull(GamePhase.nominationsOpenedAt), isNull(GamePhase.nominationsClosedAt)),
    );

/**
 * Days in running games whose timer has run out: never opened, never closed,
 * in a game that wants them opened after a while, and old enough. The caller
 * still checks each is its game's current phase.
 */
export const listDaysAwaitingAutoOpen = async (now: Date) =>
  db
    .select({ phase: GamePhase, game: Game, after: GameSettings.nominationsAfter })
    .from(GamePhase)
    .innerJoin(Game, eq(GamePhase.game, Game.id))
    .innerJoin(GameSettings, eq(GameSettings.game, Game.id))
    .where(
      and(
        eq(Game.state, 'running'),
        eq(GamePhase.phase, 'day'),
        isNull(GamePhase.nominationsOpenedAt),
        isNull(GamePhase.nominationsClosedAt),
        isNotNull(GameSettings.nominationsAfter),
        // The driver cannot bind a Date; an ISO string cast to the column's type can.
        sql`${GamePhase.createdAt} + make_interval(secs => ${GameSettings.nominationsAfter}) <= ${now.toISOString()}::timestamp`,
      ),
    );
