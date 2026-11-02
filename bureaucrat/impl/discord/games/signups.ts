import type { Client } from 'discord.js';
import { getParticipantByMember, insertParticipant } from '../../../drizzle/participants';
import { deleteSignup, getSignup, getSignupByMember, insertSignup } from '../../../drizzle/signups';
import type { Game } from '../../../schema/core/games.sql';
import type { Signup } from '../../../schema/core/people.sql';
import { joinByRole, type JoinOutcome, type ParticipantRow } from './membership';
import { grantGameRole } from './roles';

type GameRow = typeof Game.$inferSelect;
export type SignupRow = typeof Signup.$inferSelect;
type Role = SignupRow['role'];

export type RequestResult =
  | { ok: true; signup: SignupRow }
  | { ok: false; reason: 'ended' }
  | { ok: false; reason: 'already-member'; role: Role }
  | { ok: false; reason: 'already-pending' };

export const requestSignup = async (
  game: GameRow,
  member: bigint,
  role: Role,
  message?: string | null,
): Promise<RequestResult> => {
  if (game.state === 'completed') return { ok: false, reason: 'ended' };

  const participant = await getParticipantByMember(game.id, member);
  if (participant) return { ok: false, reason: 'already-member', role: participant.role };

  if (await getSignupByMember(game.id, member)) return { ok: false, reason: 'already-pending' };

  return { ok: true, signup: await insertSignup({ game: game.id, member, role, message: message ?? null }) };
};

export type AcceptResult =
  | { ok: true; participant: ParticipantRow; threads: JoinOutcome }
  | { ok: false; reason: 'not-found' | 'already-member' };

/** The request becomes membership. A Player is seated later, from Seating. */
export const acceptSignup = async (client: Client, game: GameRow, signupId: string): Promise<AcceptResult> => {
  const signup = await getSignup(signupId);
  if (!signup || signup.game !== game.id) return { ok: false, reason: 'not-found' };

  if (await getParticipantByMember(game.id, signup.member)) {
    await deleteSignup(signup.id);
    return { ok: false, reason: 'already-member' };
  }

  const participant = await insertParticipant({ game: game.id, member: signup.member, role: signup.role });
  const threads = await joinByRole(client, participant);
  await grantGameRole(client, game, participant);
  await deleteSignup(signup.id);

  return { ok: true, participant, threads };
};

export const declineSignup = async (signupId: string): Promise<void> => deleteSignup(signupId);
