import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Nomination, Vote } from '../schema/core/nominations.sql';

type InsertNomination = typeof Nomination.$inferInsert;
type UpdateNomination = Partial<
  Pick<InsertNomination, 'accusation' | 'defense' | 'block' | 'required' | 'finalizedAt'>
>;

export type NominationRow = typeof Nomination.$inferSelect;

/** A ballot line to write with the nomination: the seat, its state now, and its turn. */
export type BallotLine = { player: string; state: 'alive' | 'dead' | 'spent'; position: number };

/** The partial unique indexes refused the row: the accuser or the nominee has had their turn today. */
export class DuplicateNomination extends Error {
  constructor() {
    super('That nomination has already been made today.');
    this.name = 'DuplicateNomination';
  }
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

/**
 * The nomination and its whole ballot in one transaction, so a card never
 * finds half a roll. A unique violation is the day's rules speaking, not a
 * fault, and comes back as `DuplicateNomination`.
 */
export const insertNomination = async (row: InsertNomination, ballot: BallotLine[]): Promise<NominationRow> => {
  try {
    return await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(Nomination).values(row).returning();
      if (ballot.length > 0) {
        await tx
          .insert(Vote)
          .values(ballot.map((line) => ({ game: inserted!.game, nomination: inserted!.id, ...line })));
      }
      return inserted!;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateNomination();
    throw error;
  }
};

export const getNomination = async (id: string) => {
  const [row] = await db.select().from(Nomination).where(eq(Nomination.id, id));
  return row;
};

/** The day's nominations, oldest first. */
export const listNominationsOfPhase = async (phaseId: string) =>
  db.select().from(Nomination).where(eq(Nomination.phase, phaseId)).orderBy(asc(Nomination.createdAt));

export const listNominationsOfPhases = async (phaseIds: string[]) =>
  phaseIds.length === 0
    ? []
    : db.select().from(Nomination).where(inArray(Nomination.phase, phaseIds)).orderBy(asc(Nomination.createdAt));

export const updateNomination = async (id: string, patch: UpdateNomination) => {
  const [row] = await db.update(Nomination).set(patch).where(eq(Nomination.id, id)).returning();
  return row;
};

/** Puts one nomination (or nobody) on the day's block. */
export const setBlock = async (phaseId: string, nominationId: string | null) => {
  await db.transaction(async (tx) => {
    await tx
      .update(Nomination)
      .set({ block: false })
      .where(
        nominationId
          ? and(eq(Nomination.phase, phaseId), ne(Nomination.id, nominationId))
          : eq(Nomination.phase, phaseId),
      );
    if (nominationId) await tx.update(Nomination).set({ block: true }).where(eq(Nomination.id, nominationId));
  });
};

/** A nomination and its ballot, gone as if never made: the day's once-only rules free its two seats again. */
export const deleteNomination = async (id: string) => {
  await db.transaction(async (tx) => {
    await tx.delete(Vote).where(eq(Vote.nomination, id));
    await tx.delete(Nomination).where(eq(Nomination.id, id));
  });
};
