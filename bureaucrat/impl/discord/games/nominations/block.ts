import type { Client } from 'discord.js';
import { listNominationsOfPhase, setBlock, type NominationRow } from '../../../../drizzle/nominations';
import { listVotes } from '../../../../drizzle/votes';
import { blockAfter, statusOf, tally } from './rules';
import { dayChanged, nominationChanged } from '../../views/nominations/events';
import { publish } from './publish';

/** Puts the block where the count says, across the day's nominations as they now stand; the day's nominations come back. */
export const settleBlock = async (phaseId: string): Promise<NominationRow[]> => {
  const siblings = await listNominationsOfPhase(phaseId);
  const done = await Promise.all(
    siblings.map(async (n) => {
      const ballot = (await listVotes(n.id)).map((v) => v.vote);
      return {
        id: n.id,
        kind: n.kind,
        status: statusOf(ballot, n.required, n.finalizedAt !== null),
        tally: tally(ballot),
      };
    }),
  );
  await setBlock(phaseId, blockAfter(done));
  return siblings;
};

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
