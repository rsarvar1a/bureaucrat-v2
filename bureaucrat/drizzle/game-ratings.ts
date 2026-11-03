import { asc, and, eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { GameRating } from '../schema/core/results.sql';

export type GameRatingRow = typeof GameRating.$inferSelect;
export type RatingInput = Omit<typeof GameRating.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

/** One rating per member per game: a second submission replaces the first. */
export const upsertGameRating = async (row: RatingInput): Promise<GameRatingRow> => {
  const answers = { ...row };
  delete (answers as Partial<RatingInput>).game;
  delete (answers as Partial<RatingInput>).member;
  const [saved] = await db
    .insert(GameRating)
    .values(row)
    .onConflictDoUpdate({ target: [GameRating.game, GameRating.member], set: { ...answers, updatedAt: new Date() } })
    .returning();
  return saved!;
};

export const getGameRating = async (gameId: string, member: bigint): Promise<GameRatingRow | undefined> => {
  const [row] = await db
    .select()
    .from(GameRating)
    .where(and(eq(GameRating.game, gameId), eq(GameRating.member, member)));
  return row;
};

export const listGameRatings = async (gameId: string): Promise<GameRatingRow[]> =>
  db.select().from(GameRating).where(eq(GameRating.game, gameId)).orderBy(asc(GameRating.createdAt));
