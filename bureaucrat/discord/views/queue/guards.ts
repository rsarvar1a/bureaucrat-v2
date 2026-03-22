import type { CacheType, MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { getQueue } from '../../../drizzle/queues';
import { countEntriesByStoryteller } from '../../../drizzle/queue-entries';
import { toast } from '../../../utilities/reply';

type GuardOptions = { silent?: boolean };
type GuardInteraction = MessageComponentInteraction | ModalSubmitInteraction<CacheType>;

export const ensureEntrySlotAvailable = async (
  interaction: GuardInteraction,
  queueId: string,
  storyteller: bigint,
  options?: GuardOptions,
): Promise<boolean> => {
  const queue = await getQueue(queueId);
  if (!queue || queue.entriesPerStoryteller === null) return true;

  const existing = await countEntriesByStoryteller(queue.id, storyteller);
  if (existing < queue.entriesPerStoryteller) return true;

  if (!options?.silent) {
    await toast.ephemeral(
      interaction,
      `You already have ${existing} ${existing === 1 ? 'entry' : 'entries'} in this queue (limit: ${queue.entriesPerStoryteller}).`,
    );
  }

  return false;
};
