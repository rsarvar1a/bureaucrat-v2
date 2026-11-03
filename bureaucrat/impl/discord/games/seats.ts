import type { Client } from 'discord.js';
import {
  applySeatOrder,
  deleteSeat,
  getSeat,
  getSeatOfParticipant,
  insertSeats,
  listSeating,
  listUnseatedPlayers,
  updateSeat,
} from '../../../drizzle/seating';
import { getParticipant } from '../../../drizzle/participants';
import { listThreadsOfParticipant } from '../../../drizzle/managed-thread-participants';
import type { Seating } from '../../../schema/core/seating.sql';
import { joinThreads, leaveAllThreads, leaveThreads } from './membership';
import { appendSeats, arrangeSeats, removeSeat, type Seat } from './seating';

type SeatPatch = Partial<
  Pick<
    typeof Seating.$inferInsert,
    'trueRole' | 'trueAlignment' | 'apparentRole' | 'apparentAlignment' | 'nickname' | 'state' | 'traveler'
  >
>;

const current = async (gameId: string): Promise<Seat[]> => (await listSeating(gameId)).map(({ seat }) => seat);

/** The given Players get seats at the end, in the order given. */
export const seatPlayers = async (gameId: string, participantIds: string[]): Promise<number> => {
  if (participantIds.length === 0) return 0;

  const next = appendSeats(await current(gameId), participantIds).slice(-participantIds.length);
  await insertSeats(next.map(({ id, seat }) => ({ game: gameId, player: id, seat })));

  return participantIds.length;
};

/** Every Player without a seat gets one at the end, in the order they joined. */
export const seatUnseated = async (gameId: string): Promise<number> =>
  seatPlayers(
    gameId,
    (await listUnseatedPlayers(gameId)).map((p) => p.id),
  );

export const reorder = async (gameId: string, order: Seat[]): Promise<void> =>
  applySeatOrder(
    gameId,
    order.map(({ id, seat }) => ({ id, seat })),
  );

/** A seat with nobody in it, at the end of the circle. */
export const addEmptySeat = async (gameId: string): Promise<void> => {
  const seats = await current(gameId);
  await insertSeats([{ game: gameId, player: null, seat: seats.length + 1 }]);
};

/** The seat goes and the player leaves their threads; they stay a Player, so Add can bring them back. */
export const unseat = async (client: Client, seatId: string): Promise<boolean> => {
  const seat = await getSeat(seatId);
  if (!seat) return false;

  await deleteSeat(seatId);
  await reorder(seat.game, removeSeat(await current(seat.game), seatId));

  const participant = seat.player ? await getParticipant(seat.player) : null;
  if (participant) await leaveAllThreads(client, participant);

  return true;
};

export const setSeat = async (seatId: string, patch: SeatPatch) => updateSeat(seatId, patch);

/**
 * A grimoire's seats written onto the players matched to them, in the
 * grimoire's order: a player without a seat gets one at the end first, then
 * the matched players are arranged among the seats they hold, so a swap on
 * the site is a swap here. Seats matched to nobody are left as they are.
 */
export const applyLiveSeats = async (
  gameId: string,
  entries: { participant: string; patch: SeatPatch }[],
): Promise<number> => {
  const seated = new Set((await listSeating(gameId)).map((row) => row.seat.player));
  await seatPlayers(
    gameId,
    entries.map((e) => e.participant).filter((id) => !seated.has(id)),
  );

  let written = 0;
  for (const { participant, patch } of entries) {
    const seat = await getSeatOfParticipant(participant);
    if (!seat) continue;
    await updateSeat(seat.id, patch);
    written += 1;
  }

  const rows = (await listSeating(gameId)).map(({ seat }) => seat);
  const arranged = arrangeSeats(
    rows,
    entries.map((e) => e.participant),
  );
  if (arranged.some((row, i) => row.id !== rows[i]!.id)) await reorder(gameId, arranged);

  return written;
};

export type AssociateResult = { ok: true } | { ok: false; reason: 'no-seat' | 'not-unseated-player' };

/**
 * Puts a Player in a seat, empty or not: the seat is repointed, the newcomer
 * takes over the seat's threads and any former occupant leaves them but stays
 * a Player, so they can be put back. The nickname stays with the seat.
 */
export const associate = async (client: Client, seatId: string, participantId: string): Promise<AssociateResult> => {
  const seat = await getSeat(seatId);
  if (!seat) return { ok: false, reason: 'no-seat' };

  const incoming = await getParticipant(participantId);
  if (
    !incoming ||
    incoming.game !== seat.game ||
    incoming.role !== 'Player' ||
    (await getSeatOfParticipant(incoming.id))
  ) {
    return { ok: false, reason: 'not-unseated-player' };
  }

  const outgoing = seat.player ? await getParticipant(seat.player) : null;

  await updateSeat(seat.id, { player: incoming.id });

  if (outgoing) {
    const threads = await listThreadsOfParticipant(outgoing.id);
    await joinThreads(client, incoming, threads);
    await leaveThreads(client, outgoing, threads);
  }

  return { ok: true };
};
