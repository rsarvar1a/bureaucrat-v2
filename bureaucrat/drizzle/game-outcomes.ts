import { asc, eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { GameOutcome, GameWinner } from '../schema/core/results.sql';

type InsertGameWinner = typeof GameWinner.$inferInsert;

/** A winner as the end-of-game pane hands it over: everything but where it belongs. */
export type WinnerInput = Omit<InsertGameWinner, 'game' | 'outcome' | 'id' | 'createdAt' | 'updatedAt'>;

/** What the Storyteller declares for one result: the team, and who was on it. */
export type OutcomeInput = { winner: (typeof GameOutcome.$inferInsert)['winner']; winners: WinnerInput[] };

/** A game's results in order, numbered from one. A position already recorded is left as it is. */
export const recordOutcomes = async (gameId: string, outcomes: OutcomeInput[]) =>
  db.transaction(async (tx) => {
    for (const [index, { winner, winners }] of outcomes.entries()) {
      const [row] = await tx
        .insert(GameOutcome)
        .values({ game: gameId, position: index + 1, winner })
        .onConflictDoNothing()
        .returning();
      if (row && winners.length > 0) {
        await tx.insert(GameWinner).values(winners.map((w) => ({ ...w, game: gameId, outcome: row.id })));
      }
    }
  });

/** A game's results in order, each with its winners. */
export const listGameOutcomes = async (gameId: string) => {
  const [outcomes, winners] = await Promise.all([
    db.select().from(GameOutcome).where(eq(GameOutcome.game, gameId)).orderBy(asc(GameOutcome.position)),
    db.select().from(GameWinner).where(eq(GameWinner.game, gameId)).orderBy(asc(GameWinner.createdAt)),
  ]);
  return outcomes.map((outcome) => ({ ...outcome, winners: winners.filter((w) => w.outcome === outcome.id) }));
};
