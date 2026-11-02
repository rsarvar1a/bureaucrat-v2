import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Vote } from '../schema/core/nominations.sql';
import { Seating } from '../schema/core/seating.sql';
import { Participant } from '../schema/core/people.sql';

export type VoteRow = typeof Vote.$inferSelect;

/** A ballot line with its seat as it is now and the member holding it (null once vacated). */
export type BallotEntry = { vote: VoteRow; seat: typeof Seating.$inferSelect; member: bigint | null };

/** The ballot in voting order. */
export const listVotes = async (nominationId: string): Promise<BallotEntry[]> =>
  db
    .select({ vote: Vote, seat: Seating, member: Participant.member })
    .from(Vote)
    .innerJoin(Seating, eq(Vote.player, Seating.id))
    .leftJoin(Participant, eq(Seating.player, Participant.id))
    .where(eq(Vote.nomination, nominationId))
    .orderBy(asc(Vote.position));

export const getVoteOfSeat = async (nominationId: string, seatId: string) => {
  const [row] = await db
    .select()
    .from(Vote)
    .where(and(eq(Vote.nomination, nominationId), eq(Vote.player, seatId)));
  return row;
};

/** What the player wrote; refused (undefined) once the vote is locked. */
export const setVoteText = async (id: string, text: { public?: string | null; private?: string | null }) => {
  const [row] = await db
    .update(Vote)
    .set(text)
    .where(and(eq(Vote.id, id), eq(Vote.locked, false)))
    .returning();
  return row;
};

/** The Storyteller's lock on some seats' hands: provisional until the nomination is finalized, so a relock simply overwrites. */
export const lockVotes = async (nominationId: string, seatIds: string[], lock: { yes: boolean; weight: number }) => {
  if (seatIds.length === 0) return [];
  return db
    .update(Vote)
    .set({ locked: true, ...lock })
    .where(and(eq(Vote.nomination, nominationId), inArray(Vote.player, seatIds)))
    .returning();
};

export const unlockVotes = async (nominationId: string, seatIds: string[]) => {
  if (seatIds.length === 0) return [];
  return db
    .update(Vote)
    .set({ locked: false, yes: null, weight: null, spent: false })
    .where(and(eq(Vote.nomination, nominationId), inArray(Vote.player, seatIds)))
    .returning();
};

/** Whether this hand is the one that spent the seat's ghost vote, so a change or a reset knows to give it back. */
export const markSpent = async (id: string, spent: boolean) => {
  await db.update(Vote).set({ spent }).where(eq(Vote.id, id));
};

export const unlockVote = async (id: string) => {
  const [row] = await db
    .update(Vote)
    .set({ locked: false, yes: null, weight: null, spent: false })
    .where(eq(Vote.id, id))
    .returning();
  return row;
};

/** The seat's state as a reset nomination now sees it. */
export const resnapshotVote = async (id: string, state: VoteRow['state']) => {
  await db.update(Vote).set({ state }).where(eq(Vote.id, id));
};

/** Every lock that spent a ghost vote, across the given nominations. */
export const listSpentVotesOfNominations = async (nominationIds: string[]) =>
  nominationIds.length === 0
    ? []
    : db
        .select()
        .from(Vote)
        .where(and(inArray(Vote.nomination, nominationIds), eq(Vote.spent, true)));
