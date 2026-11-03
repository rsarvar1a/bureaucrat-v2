import { ChannelType, ThreadAutoArchiveDuration, type Client, type TextChannel } from 'discord.js';
import { currentPhase } from '../../../../drizzle/game-phases';
import { getOrCreateGameSettings } from '../../../../drizzle/game-settings';
import { insertManagedThread, listManagedThreads } from '../../../../drizzle/managed-threads';
import { listParticipants } from '../../../../drizzle/participants';
import { listSeating } from '../../../../drizzle/seating';
import {
  answerWhisper,
  getWhisper,
  insertWhisper,
  listWhisperMembers,
  spentOn,
  updateWhisper,
  type WhisperMember,
  type WhisperRow,
} from '../../../../drizzle/whispers';
import type { Game } from '../../../../schema/core/games.sql';
import type { Participant } from '../../../../schema/core/people.sql';
import type { ManagedThread } from '../../../../schema/core/threads.sql';
import { displayNames } from '../../views/queue/members';
import { writable } from '../../../../engine/discord/views/threads';
import { logger } from '../../../../utilities/logger';
import { joinThreads } from '../membership';
import { busyWhispering, syncTownVoice } from './restrict';
import { allowanceOf } from './allowance';
import { affordable, costs, neighbours, setTag, whisperThreadName, type Budget, type Spent } from './rules';

type GameRow = typeof Game.$inferSelect;
type ParticipantRow = typeof Participant.$inferSelect;
type ThreadRow = typeof ManagedThread.$inferSelect;

export type Refusal =
  | 'not-running'
  | 'not-player'
  | 'invitee-not-player'
  | 'self'
  | 'no-group'
  | 'no-async'
  | 'no-neighbour'
  | 'not-neighbours'
  | 'over-budget'
  | 'in-whisper'
  | 'other-in-whisper'
  | 'night';

export type Proposal = {
  game: GameRow;
  initiator: ParticipantRow;
  invitees: ParticipantRow[];
  async: boolean;
  /** A neighbour whisper: free, unannounced, open at once. */
  free: boolean;
};

/** The game day whispers made now count against: the `on` of the current phase. */
export const dayOf = async (gameId: string): Promise<number> => (await currentPhase(gameId))?.on ?? 1;

const travelerOf = async (gameId: string) => {
  const seated = await listSeating(gameId);
  return (participantId: string) => seated.some((row) => row.seat.player === participantId && row.seat.traveler);
};

/**
 * Checks a proposal against the game's rules and the initiator's allowance,
 * and returns what each participant would pay. The invitees pay when they
 * accept; a declined whisper costs nobody anything.
 */
export const checkProposal = async (
  proposal: Proposal,
): Promise<
  { ok: true; cost: Map<string, number>; day: number; allowance: Budget } | { ok: false; reason: Refusal }
> => {
  const { game, initiator, invitees } = proposal;
  if (game.state !== 'running') return { ok: false, reason: 'not-running' };
  if ((await currentPhase(game.id))?.phase === 'night') return { ok: false, reason: 'night' };
  if (initiator.role !== 'Player') return { ok: false, reason: 'not-player' };
  if (invitees.some((p) => p.id === initiator.id)) return { ok: false, reason: 'self' };
  if (invitees.length === 0 || invitees.some((p) => p.role !== 'Player')) {
    return { ok: false, reason: 'invitee-not-player' };
  }
  // In a synchronous whisper there is nothing to do but end it or promote it.
  if (await busyWhispering(game.id, initiator.id)) return { ok: false, reason: 'in-whisper' };

  const settings = await getOrCreateGameSettings(game.id);
  const allowance = await allowanceOf(game.id, settings);
  if (invitees.length > 1 && !settings.groupWhispers) return { ok: false, reason: 'no-group' };
  if (proposal.async && allowance.async === 0) return { ok: false, reason: 'no-async' };

  if (proposal.free) {
    if (!settings.neighbourWhispers) return { ok: false, reason: 'no-neighbour' };
    const seated = await listSeating(game.id);
    const seatOf = (id: string) => seated.find((row) => row.seat.player === id)?.seat.seat;
    const [a, b] = [seatOf(initiator.id), seatOf(invitees[0]!.id)];
    if (invitees.length !== 1 || a === undefined || b === undefined || !neighbours(a, b, seated.length)) {
      return { ok: false, reason: 'not-neighbours' };
    }
    // A free whisper opens at once, so the neighbour must be free to join it.
    if (await busyWhispering(game.id, invitees[0]!.id)) return { ok: false, reason: 'other-in-whisper' };
  }

  const isTraveler = await travelerOf(game.id);
  const cost = costs(
    [initiator, ...invitees].map((p) => ({ id: p.id, traveler: isTraveler(p.id) })),
    settings.travelerWhispers,
    proposal.free,
  );

  const day = await dayOf(game.id);
  const spent = await spentOn(game.id, initiator.id, day);
  if (!affordable(spent, cost.get(initiator.id) ?? 0, proposal.async, allowance)) {
    return { ok: false, reason: 'over-budget' };
  }

  return { ok: true, cost, day, allowance };
};

/** Writes the whisper. A free one is accepted by all at once; the rest wait on their invitees. */
export const recordProposal = async (proposal: Proposal, cost: Map<string, number>, day: number): Promise<WhisperRow> =>
  insertWhisper(
    {
      game: proposal.game.id,
      initiator: proposal.initiator.id,
      day,
      async: proposal.async,
      free: proposal.free,
      state: proposal.free ? 'accepted' : 'pending',
    },
    [proposal.initiator, ...proposal.invitees].map((p) => ({
      participant: p.id,
      cost: cost.get(p.id) ?? 0,
      accepted: proposal.free || p.id === proposal.initiator.id ? true : null,
    })),
  );

/** An earlier whisper's close may have locked the thread; the next one between the same people reopens it. */
const reopenThread = async (client: Client, threadId: bigint): Promise<void> => {
  try {
    const thread = await client.channels.fetch(String(threadId));
    if (!thread?.isThread()) return;
    await writable(thread);
    if (thread.locked) await thread.setLocked(false, 'Whisper reopened');
  } catch (error) {
    logger.warn({ message: `Could not reopen whisper thread ${threadId}.`, error });
  }
};

/**
 * The thread for a set of participants: the one an earlier whisper between
 * exactly these people opened, or a new private thread in the game channel
 * with them and the Storytellers in it.
 */
export const threadFor = async (
  client: Client,
  game: GameRow,
  members: ParticipantRow[],
  free: boolean,
): Promise<ThreadRow> => {
  const tag = setTag(members.map((m) => m.id));
  const existing = (await listManagedThreads(game.id, 'whisper')).find((t) => t.tag === tag);
  if (existing) {
    await reopenThread(client, existing.thread);
    // Someone may have been substituted out since: make sure everyone is in.
    for (const member of members) await joinThreads(client, member, [existing]);
    return existing;
  }

  const channel = (await client.channels.fetch(String(game.channel))) as TextChannel;
  const names = await displayNames(
    client,
    game.guild,
    members.map((m) => m.member),
  );
  const thread = await channel.threads.create({
    name: whisperThreadName(
      members.map((m) => names[String(m.member)] ?? String(m.member)),
      free,
    ),
    type: ChannelType.PrivateThread,
    invitable: false,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: `Whisper in ${game.name}`,
  });
  const row = await insertManagedThread({ game: game.id, kind: 'whisper', tag, thread: BigInt(thread.id) });

  for (const st of await listParticipants(game.id, 'Storyteller')) await joinThreads(client, st, [row]);
  for (const member of members) await joinThreads(client, member, [row]);

  return row;
};

export type Standing = { participant: string; spent: Spent; allowance: Budget };

/** Where everyone stands after a whisper opens: what the card shows, fixed at that moment. */
export const standings = async (game: GameRow, whisper: WhisperRow, members: WhisperMember[]): Promise<Standing[]> => {
  const allowance = await allowanceOf(game.id);
  return Promise.all(
    members.map(async (m) => ({
      participant: m.participant.id,
      spent: await spentOn(game.id, m.participant.id, whisper.day),
      allowance,
    })),
  );
};

/** Opens the thread, marks the whisper accepted, and silences its members in town if it is synchronous. */
export const openWhisper = async (client: Client, game: GameRow, whisper: WhisperRow): Promise<WhisperRow> => {
  const members = await listWhisperMembers(whisper.id);
  const thread = await threadFor(
    client,
    game,
    members.map((m) => m.participant),
    whisper.free,
  );
  const opened = (await updateWhisper(whisper.id, { state: 'accepted', thread: thread.id })) ?? whisper;
  for (const m of members) await syncTownVoice(client, game, m.participant);
  return opened;
};

export type Answer =
  | { ok: true; outcome: 'waiting' | 'opened' | 'declined'; whisper: WhisperRow }
  | { ok: false; reason: 'not-invited' | 'answered' | 'closed' | 'over-budget' | 'in-whisper' }
  | { ok: false; reason: 'other-in-whisper'; who: ParticipantRow };

/**
 * An invitee's yes or no. A yes from the last of them opens the thread; a no
 * from any of them ends it. An invitee who cannot afford it, or who is in a
 * synchronous whisper still, is told so and the whisper keeps waiting; so is
 * the last yes when someone else in it is, since the yes would open it.
 */
export const answerInvitation = async (
  client: Client,
  game: GameRow,
  whisperId: string,
  participant: ParticipantRow,
  accepted: boolean,
): Promise<Answer> => {
  const whisper = await getWhisper(whisperId);
  if (!whisper || whisper.state !== 'pending') return { ok: false, reason: 'closed' };

  const members = await listWhisperMembers(whisper.id);
  const mine = members.find((m) => m.participant.id === participant.id);
  if (!mine || whisper.initiator === participant.id) return { ok: false, reason: 'not-invited' };
  if (mine.part.accepted !== null) return { ok: false, reason: 'answered' };

  if (!accepted) {
    await answerWhisper(whisper.id, participant.id, false);
    const declined = (await updateWhisper(whisper.id, { state: 'declined' })) ?? whisper;
    return { ok: true, outcome: 'declined', whisper: declined };
  }

  const allowance = await allowanceOf(game.id);
  const spent = await spentOn(game.id, participant.id, whisper.day);
  if (!affordable(spent, mine.part.cost, whisper.async, allowance)) return { ok: false, reason: 'over-budget' };
  if (await busyWhispering(game.id, participant.id)) return { ok: false, reason: 'in-whisper' };

  const everyone = members.every((m) => m.participant.id === participant.id || m.part.accepted === true);
  if (everyone) {
    for (const m of members) {
      if (m.participant.id !== participant.id && (await busyWhispering(game.id, m.participant.id))) {
        return { ok: false, reason: 'other-in-whisper', who: m.participant };
      }
    }
  }

  await answerWhisper(whisper.id, participant.id, true);
  if (!everyone) return { ok: true, outcome: 'waiting', whisper };

  return { ok: true, outcome: 'opened', whisper: await openWhisper(client, game, whisper) };
};

export const threadUrl = (guild: bigint, thread: bigint): string => `https://discord.com/channels/${guild}/${thread}`;
