import { eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { GameSettings } from '../schema/core/games.sql';

type InsertGameSettings = typeof GameSettings.$inferInsert;

/**
 * The public threads a fresh game plans to open when it starts. The bindings'
 * column defaults name three of them, so a fresh game's nominations, script,
 * seating and whispers each have a home without a Storyteller choosing one.
 */
export const DEFAULT_PLANNED_THREADS = [
  'Actions & Announcements',
  'Claims & Conjectures',
  'Nominations',
  'Rules & References',
  'Script & Seating',
  'Whispers',
];

/**
 * A game's settings row, made on first read.
 *
 * Created lazily rather than alongside the game so a game that predates a
 * setting still has one, with the defaults, the first time anybody looks.
 */
export const getOrCreateGameSettings = async (gameId: string) => {
  const [existing] = await db.select().from(GameSettings).where(eq(GameSettings.game, gameId));
  if (existing) return existing;

  const [row] = await db
    .insert(GameSettings)
    .values({ game: gameId, plannedThreads: DEFAULT_PLANNED_THREADS })
    .onConflictDoNothing()
    .returning();

  if (row) return row;

  // Lost a race with another first reader; theirs is the row.
  const [theirs] = await db.select().from(GameSettings).where(eq(GameSettings.game, gameId));
  return theirs!;
};

export const updateGameSettings = async (gameId: string, patch: Partial<Omit<InsertGameSettings, 'game'>>) => {
  const [row] = await db.update(GameSettings).set(patch).where(eq(GameSettings.game, gameId)).returning();
  return row;
};
