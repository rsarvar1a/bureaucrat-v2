import type { TextBasedChannel } from 'discord.js';
import { clientOf, type SpawnTarget } from '../../../engine/discord/views/lifecycle';
import { listViews } from '../../../engine/discord/views/query';
import type { Spawn } from '../../../engine/discord/views/windows';
import { countActiveGames } from '../../../drizzle/games';
import { listQueueEntries } from '../../../drizzle/queue-entries';
import { getQueue } from '../../../drizzle/queues';

/**
 * How many more games a queue may run: its concurrency less what is active.
 * A queue with no concurrency set has no cap.
 */
export const freeSlots = (concurrency: number | null, active: number): number =>
  concurrency === null ? Number.POSITIVE_INFINITY : Math.max(0, concurrency - active);

export type Claimant = { id: string; storyteller: bigint; minimumStartDate: Date | null };

/**
 * Who is offered a slot: the first entry in queue order that is ready to start
 * and has not passed on this vacancy already.
 *
 * `passed` is per vacancy, not per entry: a Storyteller who passes today is
 * asked again the next time a slot opens.
 */
export const nextClaimant = <T extends Claimant>(entries: T[], passed: string[], now: Date): T | null =>
  entries.find(
    (entry) =>
      !passed.includes(entry.id) &&
      (entry.minimumStartDate === null || entry.minimumStartDate.getTime() <= now.getTime()),
  ) ?? null;

// Offers the slot to whoever is next, as a card in the queue's entries thread.
// One offer per queue at a time; a second vacancy while one is pending waits
// for the answer, since the answer may be the claim that fills it.
export const offerVacancy = async (
  spawn: Spawn,
  target: SpawnTarget,
  queueId: string,
  passed: string[] = [],
): Promise<boolean> => {
  const queue = await getQueue(queueId);
  if (!queue) return false;

  if (freeSlots(queue.concurrency, await countActiveGames(queue.id)) <= 0) return false;

  const pending = (await listViews({ route: 'qoffer' })).some(
    (row) => (row.state as { queue?: string } | null)?.queue === queueId,
  );
  if (pending) return false;

  const entry = nextClaimant(await listQueueEntries(queueId), passed, new Date());
  if (!entry) return false;

  // The queue panel is the offer's parent: it holds the entries thread in its
  // state, and parenting there is what makes `${queue}` resolve for the card.
  const [panel] = await listViews({ route: 'queue', entityId: queueId });
  const threadId = (panel?.state as { threadId?: string | null } | null)?.threadId;
  if (!panel || !threadId) return false;

  const thread = await clientOf(target)
    .channels.fetch(threadId)
    .catch(() => null);
  if (!thread || !('send' in thread)) return false;

  await spawn(
    'qoffer',
    { ...target, channel: thread as TextBasedChannel },
    { parent: panel.id, entityId: entry.id, ids: { qentry: entry.id }, state: { queue: queueId, passed } },
  );

  return true;
};
