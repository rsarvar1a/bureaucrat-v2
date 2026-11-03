import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Seating } from '../schema/core/seating.sql';
import { Participant } from '../schema/core/people.sql';

type InsertSeat = typeof Seating.$inferInsert;
type UpdateSeat = Partial<Omit<InsertSeat, 'id' | 'game'>>;

/** `member` is null for an empty seat. */
export type SeatedPlayer = { seat: typeof Seating.$inferSelect; member: bigint | null };

export const listSeating = async (gameId: string): Promise<SeatedPlayer[]> =>
  db
    .select({ seat: Seating, member: Participant.member })
    .from(Seating)
    .leftJoin(Participant, eq(Seating.player, Participant.id))
    .where(eq(Seating.game, gameId))
    .orderBy(asc(Seating.seat));

export const getSeatedPlayer = async (id: string): Promise<SeatedPlayer | undefined> => {
  const [row] = await db
    .select({ seat: Seating, member: Participant.member })
    .from(Seating)
    .leftJoin(Participant, eq(Seating.player, Participant.id))
    .where(eq(Seating.id, id));
  return row;
};

export const getSeat = async (id: string) => {
  const [row] = await db.select().from(Seating).where(eq(Seating.id, id));
  return row;
};

export const insertSeats = async (rows: InsertSeat[]) => {
  if (rows.length === 0) return [];
  return db.insert(Seating).values(rows).returning();
};

export const updateSeat = async (id: string, patch: UpdateSeat) => {
  const [row] = await db.update(Seating).set(patch).where(eq(Seating.id, id)).returning();
  return row;
};

export const deleteSeat = async (id: string) => {
  await db.delete(Seating).where(eq(Seating.id, id));
};

// Two passes inside one transaction: `unique(game, seat)` would refuse a
// direct renumbering the moment two rows met in the middle.
export const applySeatOrder = async (gameId: string, order: { id: string; seat: number }[]) => {
  await db.transaction(async (tx) => {
    await tx
      .update(Seating)
      .set({ seat: sql`-${Seating.seat}` })
      .where(eq(Seating.game, gameId));
    for (const { id, seat } of order) {
      await tx
        .update(Seating)
        .set({ seat })
        .where(and(eq(Seating.id, id), eq(Seating.game, gameId)));
    }
  });
};

export const listUnseatedPlayers = async (gameId: string) =>
  db
    .select({ participant: Participant })
    .from(Participant)
    .leftJoin(Seating, eq(Seating.player, Participant.id))
    .where(and(eq(Participant.game, gameId), eq(Participant.role, 'Player'), isNull(Seating.id)))
    .orderBy(asc(Participant.createdAt))
    .then((rows) => rows.map((r) => r.participant));

export const countSeats = async (gameId: string) => {
  const [row] = await db.select({ n: count() }).from(Seating).where(eq(Seating.game, gameId));
  return row?.n ?? 0;
};

export const getSeatOfParticipant = async (participantId: string) => {
  const [row] = await db.select().from(Seating).where(eq(Seating.player, participantId));
  return row;
};
