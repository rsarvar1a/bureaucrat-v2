import type { Client } from 'discord.js';
import { writable } from '../../../engine/discord/views/threads';
import { listManagedThreadsByKinds } from '../../../drizzle/managed-threads';
import {
  deleteThreadMemberships,
  insertThreadMemberships,
  listThreadsOfParticipant,
} from '../../../drizzle/managed-thread-participants';
import { logger } from '../../../utilities/logger';
import type { Participant } from '../../../schema/core/people.sql';
import type { ManagedThread } from '../../../schema/core/threads.sql';

export type ParticipantRow = typeof Participant.$inferSelect;
export type ManagedThreadRow = typeof ManagedThread.$inferSelect;
type Role = ParticipantRow['role'];
type Kind = ManagedThreadRow['kind'];

/** Which of a game's threads a role belongs in by default. Players join theirs by seat, not by role. */
export const threadKindsForRole = (role: Role): Kind[] => {
  switch (role) {
    case 'Storyteller':
      return ['storyteller', 'config', 'kibitz', 'ST thread', 'whisper', 'reveal', 'reactions'];
    case 'Kibitzer':
      return ['kibitz'];
    case 'Player':
      return [];
  }
};

export type JoinOutcome = { joined: number; failed: bigint[] };

const threadOf = async (client: Client, row: ManagedThreadRow) => {
  const channel = await client.channels.fetch(String(row.thread)).catch(() => null);
  if (!channel?.isThread()) return null;
  await writable(channel);
  return channel;
};

/**
 * Discord first, rows always. A member who has left the server or a thread
 * the bot can no longer reach is reported rather than thrown, and the row is
 * still written, because the row is what substitution and removal read.
 */
export const joinThreads = async (
  client: Client,
  participant: ParticipantRow,
  threads: ManagedThreadRow[],
): Promise<JoinOutcome> => {
  const outcome: JoinOutcome = { joined: 0, failed: [] };

  for (const row of threads) {
    try {
      const thread = await threadOf(client, row);
      if (!thread) throw new Error('thread not found');
      await thread.members.add(String(participant.member));
      outcome.joined += 1;
    } catch (error) {
      logger.debug({ message: `Could not add ${participant.member} to thread ${row.thread}.`, error });
      outcome.failed.push(row.thread);
    }
  }

  await insertThreadMemberships(
    threads.map((row) => ({ game: participant.game, thread: row.id, participant: participant.id })),
  );

  return outcome;
};

/**
 * Lets somebody who is not in the game into a thread: a reader of the reveal
 * after the fact. Discord only, since there is no Participant to write a row
 * for; the thread's own membership is the record.
 */
export const admitGuest = async (client: Client, row: ManagedThreadRow, member: bigint): Promise<boolean> => {
  try {
    const thread = await threadOf(client, row);
    if (!thread) return false;
    await thread.members.add(String(member));
    return true;
  } catch (error) {
    logger.debug({ message: `Could not admit ${member} to thread ${row.thread}.`, error });
    return false;
  }
};

/** The counterpart of `admitGuest`: Discord only, no row to delete. */
export const expelGuest = async (client: Client, row: ManagedThreadRow, member: bigint): Promise<boolean> => {
  try {
    const thread = await threadOf(client, row);
    if (!thread) return false;
    await thread.members.remove(String(member));
    return true;
  } catch (error) {
    logger.debug({ message: `Could not remove ${member} from thread ${row.thread}.`, error });
    return false;
  }
};

/**
 * The game's public threads change hands: Start seats the town in them with
 * one role ping, so they carry no membership rows, and a newcomer brought in
 * by seat alone would have to find each one and join it by hand. Discord
 * only, as `admitGuest` is: the rows stay the record of the private threads.
 */
export const swapInPublicThreads = async (
  client: Client,
  gameId: string,
  incoming: ParticipantRow,
  outgoing: ParticipantRow | null,
): Promise<JoinOutcome> => {
  const outcome: JoinOutcome = { joined: 0, failed: [] };
  for (const row of await listManagedThreadsByKinds(gameId, ['public'])) {
    if (await admitGuest(client, row, incoming.member)) outcome.joined += 1;
    else outcome.failed.push(row.thread);
    if (outgoing) await expelGuest(client, row, outgoing.member);
  }
  return outcome;
};

export const leaveThreads = async (
  client: Client,
  participant: ParticipantRow,
  threads: ManagedThreadRow[],
): Promise<void> => {
  for (const row of threads) {
    try {
      const thread = await threadOf(client, row);
      await thread?.members.remove(String(participant.member));
    } catch (error) {
      logger.debug({ message: `Could not remove ${participant.member} from thread ${row.thread}.`, error });
    }
  }

  await deleteThreadMemberships(
    participant.id,
    threads.map((row) => row.id),
  );
};

export const leaveAllThreads = async (client: Client, participant: ParticipantRow): Promise<void> =>
  leaveThreads(client, participant, await listThreadsOfParticipant(participant.id));

export const joinByRole = async (client: Client, participant: ParticipantRow): Promise<JoinOutcome> =>
  joinThreads(
    client,
    participant,
    await listManagedThreadsByKinds(participant.game, threadKindsForRole(participant.role)),
  );
