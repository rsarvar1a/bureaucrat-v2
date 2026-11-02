import type { Client } from 'discord.js';
import { listNominationsOfPhase, setBlock } from '../../../../drizzle/nominations';
import { dayChanged, nominationChanged } from '../../views/nominations/events';
import { publish } from './publish';

/**
 * The Storyteller's hand on the block: one of today's nominations, or nobody.
 * The rules put the block where the count says once a nomination settles
 * (`blockAfter`), and the next settle will say again; this is the escape
 * hatch for the character effects the count cannot see, used after the
 * fact. Every card of the day redraws, since each shows whether it is the
 * one on the block.
 */
export const placeOnBlock = async (client: Client, phaseId: string, nominationId: string | null): Promise<void> => {
  await setBlock(phaseId, nominationId);
  const siblings = await listNominationsOfPhase(phaseId);
  await publish(client, [dayChanged(phaseId), ...siblings.map((n) => nominationChanged(n.id))]);
};
