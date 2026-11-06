import type { Client } from 'discord.js';
import type { SpawnTarget } from '../../../../engine/discord/views/lifecycle';
import { writable } from '../../../../engine/discord/views/threads';
import { getOrCreateGameSettings } from '../../../../drizzle/game-settings';
import { getManagedThread, listManagedThreads } from '../../../../drizzle/managed-threads';
import { getParticipant } from '../../../../drizzle/participants';
import { listSeating } from '../../../../drizzle/seating';
import {
  answerPromotion as recordAnswer,
  endAllMembers,
  endMember,
  getOpenWhisperOfThread,
  getWhisper,
  listOpenWhispers,
  listWhisperMembers,
  promoteWhisper,
  setPromotion,
  spentOn,
  updateWhisper,
  type WhisperMember,
  type WhisperRow,
} from '../../../../drizzle/whispers';
import type { Game } from '../../../../schema/core/games.sql';
import type { Participant } from '../../../../schema/core/people.sql';
import type { ManagedThread } from '../../../../schema/core/threads.sql';
import { logger } from '../../../../utilities/logger';
import { whisperChanged } from '../../views/whispers/events';
import { boundChannel } from '../bound-thread';
import { spawnByRoute } from '../create';
import { publish } from '../publish';
import { checkProposal, openWhisper, recordProposal, threadFor } from './propose';
import { syncTownVoice } from './restrict';
import { allowanceOf } from './allowance';
import { lockOnClose, neighbours, promotable, promotedCost, remainingAfter } from './rules';
import { displayNames } from '../../views/queue/members';
import { S } from '../../../../strings';

type GameRow = typeof Game.$inferSelect;
type ParticipantRow = typeof Participant.$inferSelect;
type ThreadRow = typeof ManagedThread.$inferSelect;

export const PROMOTE_CARD = 'gwhisperpromote';

export type CloseReason = 'ended' | 'night' | 'storyteller';

/** Why a thread locks: a close, or the rest of a group whisper moving on without someone. */
type LockReason = CloseReason | 'left';

const REASON: Record<LockReason, string> = {
  ended: 'Whisper ended',
  night: 'Night fell',
  storyteller: 'Closed by a Storyteller',
  left: 'A member left; the whisper carries on elsewhere',
};

/** A line in a whisper thread, best effort: a thread the bot cannot write to is logged and left. */
const sayIn = async (client: Client, threadId: bigint, content: string): Promise<void> => {
  const thread = await client.channels.fetch(String(threadId)).catch(() => null);
  if (!thread?.isSendable()) return;
  await thread
    .send({ content, allowedMentions: { parse: [] } })
    .catch((error: unknown) => logger.warn({ message: `Could not write in whisper thread ${threadId}.`, error }));
};

/** A member's name as a private thread may carry it: plain, so it adds nobody. */
const nameOf = async (client: Client, game: GameRow, participant: ParticipantRow): Promise<string> => {
  const names = await displayNames(client, game.guild, [participant.member]);
  return names[String(participant.member)] ?? String(participant.member);
};

const lockThread = async (client: Client, whisper: WhisperRow, reason: LockReason): Promise<void> => {
  const row = whisper.thread ? await getManagedThread(whisper.thread) : undefined;
  if (row) await lockThreadRow(client, row, reason);
};

const lockThreadRow = async (client: Client, row: ThreadRow, reason: LockReason): Promise<void> => {
  try {
    const thread = await client.channels.fetch(String(row.thread));
    if (!thread?.isThread()) return;
    await writable(thread);
    if (!thread.locked) await thread.setLocked(true, REASON[reason]);
  } catch (error) {
    logger.warn({ message: `Could not lock whisper thread ${row.thread}.`, error });
  }
};

/** Whether this whisper's thread locks when it closes: not for two neighbours under the neighbour rule. */
const locks = async (game: GameRow, members: WhisperMember[]): Promise<boolean> => {
  const settings = await getOrCreateGameSettings(game.id);
  if (!settings.neighbourWhispers) return true;
  const seated = await listSeating(game.id);
  const seatOf = (id: string) => seated.find((row) => row.seat.player === id)?.seat.seat;
  return lockOnClose(
    settings.neighbourWhispers,
    members.map((m) => seatOf(m.participant.id)),
    seated.length,
  );
};

/**
 * Closes a whisper for everyone: every part ended, the row `ended`, the
 * thread locked unless it is two neighbours' standing channel (a night locks
 * that too), and everyone's town voice back. A pending one simply lapses.
 */
export const closeWhisper = async (client: Client, game: GameRow, whisper: WhisperRow, reason: CloseReason) => {
  const members = await listWhisperMembers(whisper.id);
  await endAllMembers(whisper.id);
  const closed = (await updateWhisper(whisper.id, { state: 'ended', promoting: false })) ?? whisper;

  // The thread is the pair's, not the whisper's: another whisper still open in it keeps it unlocked.
  const shared = whisper.thread ? await getOpenWhisperOfThread(whisper.thread) : undefined;
  if (whisper.state === 'accepted' && !shared && (reason === 'night' || (await locks(game, members)))) {
    await lockThread(client, whisper, reason);
  }
  for (const m of members) await syncTownVoice(client, game, m.participant);
  await publish(client, [whisperChanged(whisper.id)]);
  return closed;
};

/**
 * Night, or the game's end: nothing stays open. Every whisper thread locks,
 * not only those of whispers closed just now: a neighbours' thread left
 * open by an earlier close is theirs by day, not by night.
 */
export const closeAllWhispers = async (client: Client, game: GameRow, reason: CloseReason): Promise<void> => {
  for (const { whisper } of await listOpenWhispers(game.id)) await closeWhisper(client, game, whisper, reason);
  for (const row of await listManagedThreads(game.id, 'whisper')) await lockThreadRow(client, row, reason);
};

/**
 * Day breaks on the neighbours' standing threads: with the neighbour rule
 * on, every whisper thread between two players now seated side by side gets
 * a fresh free whisper for the day, which unlocks it, and a line saying so.
 */
export const reopenNeighbourWhispers = async (client: Client, game: GameRow): Promise<void> => {
  const settings = await getOrCreateGameSettings(game.id);
  if (!settings.neighbourWhispers) return;

  const seated = await listSeating(game.id);
  const seatOf = (id: string) => seated.find((row) => row.seat.player === id)?.seat.seat;

  for (const row of await listManagedThreads(game.id, 'whisper')) {
    const ids = (row.tag ?? '').split(',').filter(Boolean);
    if (ids.length !== 2) continue;
    const [a, b] = ids.map(seatOf);
    if (a === undefined || b === undefined || !neighbours(a, b, seated.length)) continue;
    if (await getOpenWhisperOfThread(row.id)) continue;

    const [initiator, invitee] = await Promise.all(ids.map((id) => getParticipant(id)));
    if (!initiator || !invitee) continue;
    const proposal = { game, initiator, invitees: [invitee], async: false, free: true };
    const check = await checkProposal(proposal);
    if (!check.ok) continue;

    await openWhisper(client, game, await recordProposal(proposal, check.cost, check.day));
    await sayIn(client, row.thread, S.whispers.neighbourReopened(check.day));
  }
};

/**
 * The rest of a group whisper carry on without the one who left, in the
 * thread that is theirs alone (made now, or the one an earlier whisper
 * between exactly them opened), so the leaver reads nothing said after they
 * went. The whisper itself is the same row, already paid for: its card
 * shows one member gone and the rest still whispering.
 */
const continueWithout = async (
  client: Client,
  game: GameRow,
  whisper: WhisperRow,
  remaining: ParticipantRow[],
  leaver: ParticipantRow,
): Promise<void> => {
  const old = whisper.thread ? await getManagedThread(whisper.thread) : undefined;
  const thread = await threadFor(client, game, remaining, whisper.free);
  await updateWhisper(whisper.id, { thread: thread.id });
  if (old && old.id !== thread.id) await lockThreadRow(client, old, 'left');
  await sayIn(client, thread.thread, S.whispers.continued(await nameOf(client, game, leaver)));
};

export type Ended = { ok: true; closed: boolean } | { ok: false; reason: 'not-open' | 'not-member' | 'already-ended' };

/**
 * One member's part ends. The second-last one out closes the whisper and the
 * last is let out with them: a whisper of one is nobody's. Two or more left
 * carry on in a thread of their own.
 */
export const endFor = async (
  client: Client,
  game: GameRow,
  whisper: WhisperRow,
  participant: ParticipantRow,
): Promise<Ended> => {
  if (whisper.state !== 'accepted') return { ok: false, reason: 'not-open' };
  const members = await listWhisperMembers(whisper.id);
  const mine = members.find((m) => m.participant.id === participant.id);
  if (!mine) return { ok: false, reason: 'not-member' };
  if (mine.part.endedAt !== null) return { ok: false, reason: 'already-ended' };

  await endMember(whisper.id, participant.id);
  await syncTownVoice(client, game, participant);

  const remaining = remainingAfter(
    members.map((m) => ({ participant: m.participant.id, endedAt: m.part.endedAt })),
    participant.id,
  );
  if (remaining.length <= 1) {
    const row = remaining.length === 1 && whisper.thread ? await getManagedThread(whisper.thread) : undefined;
    if (row) await sayIn(client, row.thread, S.whispers.lastLeft(await nameOf(client, game, participant)));
    await closeWhisper(client, game, whisper, 'ended');
    return { ok: true, closed: true };
  }

  await continueWithout(
    client,
    game,
    whisper,
    members.filter((m) => remaining.includes(m.participant.id)).map((m) => m.participant),
    participant,
  );
  await publish(client, [whisperChanged(whisper.id)]);
  return { ok: true, closed: false };
};

export type PromotionRefusal = 'not-open' | 'not-member' | 'async' | 'free' | 'no-async' | 'promoting' | 'over-budget';

export type Asked =
  | { ok: true; channel: string }
  | { ok: false; reason: Exclude<PromotionRefusal, 'over-budget'> }
  | { ok: false; reason: 'over-budget'; who: ParticipantRow[] };

/**
 * A member asks to make the whisper asynchronous. Everyone must have room for
 * what it will cost them, which in a hybrid game includes anything the traveler
 * rule let them off when it opened. The request card goes where invitations go.
 */
export const askPromotion = async (
  client: Client,
  target: SpawnTarget,
  game: GameRow,
  whisper: WhisperRow,
  asker: ParticipantRow,
): Promise<Asked> => {
  if (whisper.state !== 'accepted') return { ok: false, reason: 'not-open' };
  if (whisper.async) return { ok: false, reason: 'async' };
  if (whisper.free) return { ok: false, reason: 'free' };
  if (whisper.promoting) return { ok: false, reason: 'promoting' };

  const members = await listWhisperMembers(whisper.id);
  if (!members.some((m) => m.participant.id === asker.id)) return { ok: false, reason: 'not-member' };

  const settings = await getOrCreateGameSettings(game.id);
  const allowance = await allowanceOf(game.id, settings);
  if (allowance.async === 0) return { ok: false, reason: 'no-async' };

  const who: ParticipantRow[] = [];
  for (const m of members) {
    const spent = await spentOn(game.id, m.participant.id, whisper.day);
    const cost = promotedCost(settings.whisperMode, m.part.cost, members.length);
    if (!promotable(spent, m.part.cost, cost, allowance)) who.push(m.participant);
  }
  if (who.length > 0) return { ok: false, reason: 'over-budget', who };

  const where = await boundChannel(client, game, 'whisperThread');
  if (!where) return { ok: false, reason: 'not-open' };

  await setPromotion(whisper.id, asker.id);
  await spawnByRoute(
    PROMOTE_CARD,
    { ...target, channel: where.channel },
    { entityId: whisper.id, ids: { gconfig: game.id }, state: { asker: asker.id, outcome: null } },
  );
  await publish(client, [whisperChanged(whisper.id)]);
  return { ok: true, channel: where.channel.id };
};

export type PromotionAnswer =
  | { ok: true; outcome: 'waiting' | 'promoted' | 'declined' }
  | { ok: false; reason: 'not-member' | 'answered' | 'closed' | 'over-budget' };

/** A member's yes or no to the open request. The last yes flips the whisper; any no withdraws the request. */
export const answerPromotion = async (
  client: Client,
  game: GameRow,
  whisperId: string,
  participant: ParticipantRow,
  yes: boolean,
): Promise<PromotionAnswer> => {
  const whisper = await getWhisper(whisperId);
  if (!whisper || whisper.state !== 'accepted' || !whisper.promoting) return { ok: false, reason: 'closed' };

  const members = await listWhisperMembers(whisper.id);
  const mine = members.find((m) => m.participant.id === participant.id);
  if (!mine) return { ok: false, reason: 'not-member' };
  if (mine.part.promote !== null) return { ok: false, reason: 'answered' };

  if (!yes) {
    await recordAnswer(whisper.id, participant.id, false);
    await updateWhisper(whisper.id, { promoting: false });
    await publish(client, [whisperChanged(whisper.id)]);
    return { ok: true, outcome: 'declined' };
  }

  const settings = await getOrCreateGameSettings(game.id);
  const allowance = await allowanceOf(game.id, settings);
  const spent = await spentOn(game.id, participant.id, whisper.day);
  const cost = promotedCost(settings.whisperMode, mine.part.cost, members.length);
  if (!promotable(spent, mine.part.cost, cost, allowance)) return { ok: false, reason: 'over-budget' };

  await recordAnswer(whisper.id, participant.id, true);
  const everyone = members.every((m) => m.participant.id === participant.id || m.part.promote === true);
  if (!everyone) return { ok: true, outcome: 'waiting' };

  await promoteWhisper(
    whisper.id,
    members.map((m) => ({
      participant: m.participant.id,
      cost: promotedCost(settings.whisperMode, m.part.cost, members.length),
    })),
  );
  for (const m of members) await syncTownVoice(client, game, m.participant);
  await publish(client, [whisperChanged(whisper.id)]);
  return { ok: true, outcome: 'promoted' };
};
