import { asc, eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { GameWinner } from '../schema/core/results.sql';

type InsertGameWinner = typeof GameWinner.$inferInsert;

/** A winner as the end-of-game pane hands it over: everything but the game. */
export type WinnerInput = Omit<InsertGameWinner, 'game' | 'id' | 'createdAt' | 'updatedAt'>;

export const insertGameWinners = async (rows: InsertGameWinner[]) => {
  if (rows.length === 0) return [];
  return db.insert(GameWinner).values(rows).onConflictDoNothing().returning();
};

export const listGameWinners = async (gameId: string) =>
  db.select().from(GameWinner).where(eq(GameWinner.game, gameId)).orderBy(asc(GameWinner.createdAt));
