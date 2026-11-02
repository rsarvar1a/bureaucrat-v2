import type { Client } from 'discord.js';
import {
  countParticipants,
  deleteParticipant,
  getParticipant,
  getParticipantByMember,
  insertParticipant,
} from '../../../drizzle/participants';
import { getSeatOfParticipant } from '../../../drizzle/seating';
import type { Game } from '../../../schema/core/games.sql';
import { joinByRole, leaveAllThreads, type JoinOutcome, type ParticipantRow } from './membership';
import { grantGameRole, revokeGameRole } from './roles';
import { unseat } from './seats';

type GameRow = typeof Game.$inferSelect;
type Role = ParticipantRow['role'];

export type AddResult =
  | { ok: true; participant: ParticipantRow; threads: JoinOutcome }
  | { ok: false; reason: 'already-member'; role: Role };

export const addMember = async (client: Client, game: GameRow, member: bigint, role: Role): Promise<AddResult> => {
  const existing = await getParticipantByMember(game.id, member);
  if (existing) return { ok: false, reason: 'already-member', role: existing.role };

  const participant = await insertParticipant({ game: game.id, member, role });
  const threads = await joinByRole(client, participant);
  await grantGameRole(client, game, participant);

  return { ok: true, participant, threads };
};

export type RemoveResult =
  | { ok: true; participant: ParticipantRow }
  | { ok: false; reason: 'not-found' | 'last-storyteller' };

/** Out of the game entirely: seat, threads, row. The last Storyteller stays, or nobody could reach the windows. */
export const removeMember = async (client: Client, game: GameRow, participantId: string): Promise<RemoveResult> => {
  const participant = await getParticipant(participantId);
  if (!participant || participant.game !== game.id) return { ok: false, reason: 'not-found' };

  if (participant.role === 'Storyteller' && (await countParticipants(game.id, 'Storyteller')) <= 1) {
    return { ok: false, reason: 'last-storyteller' };
  }

  const seat = await getSeatOfParticipant(participant.id);
  if (seat) await unseat(client, seat.id);

  await leaveAllThreads(client, participant);
  await revokeGameRole(client, game, participant);
  await deleteParticipant(participant.id);

  return { ok: true, participant };
};
