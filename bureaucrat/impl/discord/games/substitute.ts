import type { Client } from 'discord.js';
import {
  deleteParticipant,
  getParticipant,
  getParticipantByMember,
  insertParticipant,
} from '../../../drizzle/participants';
import { getSeat, getSeatOfParticipant, updateSeat } from '../../../drizzle/seating';
import { deleteSignup, getSignup } from '../../../drizzle/signups';
import { listThreadsOfParticipant } from '../../../drizzle/managed-thread-participants';
import type { Game } from '../../../schema/core/games.sql';
import { joinThreads, leaveThreads, swapInPublicThreads, type JoinOutcome, type ParticipantRow } from './membership';
import { grantGameRole, revokeGameRole } from './roles';

type GameRow = typeof Game.$inferSelect;

export type Incoming = { kind: 'signup' | 'participant'; id: string };

export type SubstituteResult =
  | { ok: true; outgoing: ParticipantRow | null; incoming: ParticipantRow; threads: JoinOutcome }
  | { ok: false; reason: 'no-seat' | 'no-incoming' | 'incoming-seated' | 'incoming-not-player' };

const materialise = async (game: GameRow, incoming: Incoming): Promise<ParticipantRow | null> => {
  if (incoming.kind === 'participant') return (await getParticipant(incoming.id)) ?? null;

  const signup = await getSignup(incoming.id);
  if (!signup || signup.game !== game.id) return null;

  const existing = await getParticipantByMember(game.id, signup.member);
  const participant = existing ?? (await insertParticipant({ game: game.id, member: signup.member, role: 'Player' }));
  await deleteSignup(signup.id);

  return participant;
};

/**
 * The newcomer takes the seat, every thread the outgoing player was in, and
 * the game's public threads; the outgoing player leaves them all and the
 * game. The seat is repointed first because `(game, player)` cascades:
 * deleting the old participant first would take the seat with it.
 */
export const substitute = async (
  client: Client,
  game: GameRow,
  seatId: string,
  incoming: Incoming,
): Promise<SubstituteResult> => {
  const seat = await getSeat(seatId);
  if (!seat || seat.game !== game.id) return { ok: false, reason: 'no-seat' };

  // An empty seat has nobody going out; the newcomer simply takes it.
  const outgoing = seat.player ? ((await getParticipant(seat.player)) ?? null) : null;

  const newcomer = await materialise(game, incoming);
  if (!newcomer || newcomer.game !== game.id) return { ok: false, reason: 'no-incoming' };
  if (newcomer.role !== 'Player') return { ok: false, reason: 'incoming-not-player' };
  if (await getSeatOfParticipant(newcomer.id)) return { ok: false, reason: 'incoming-seated' };

  await updateSeat(seat.id, { player: newcomer.id });

  const threads = outgoing ? await listThreadsOfParticipant(outgoing.id) : [];
  const privately = await joinThreads(client, newcomer, threads);
  const publicly = await swapInPublicThreads(client, game.id, newcomer, outgoing);
  const joined: JoinOutcome = {
    joined: privately.joined + publicly.joined,
    failed: [...privately.failed, ...publicly.failed],
  };
  await grantGameRole(client, game, newcomer);
  if (outgoing) {
    await leaveThreads(client, outgoing, threads);
    await revokeGameRole(client, game, outgoing);
    await deleteParticipant(outgoing.id);
  }

  return { ok: true, outgoing, incoming: newcomer, threads: joined };
};
