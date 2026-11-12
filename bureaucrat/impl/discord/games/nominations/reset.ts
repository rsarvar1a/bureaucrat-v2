import type { Client } from 'discord.js';
import { getNomination, updateNomination, type NominationRow } from '../../../../drizzle/nominations';
import { listSeating } from '../../../../drizzle/seating';
import { listVotes, resnapshotVote, unlockVote, type BallotEntry } from '../../../../drizzle/votes';
import { gameEvents } from '../../views/games/events';
import { dayChanged, nominationChanged } from '../../views/nominations/events';
import { setSeat } from '../seats';
import { settleBlock } from './block';
import { publish } from './publish';
import { requiredVotes } from './rules';
import { seatRef } from './nominate';

export type ResetResult = { ok: true } | { ok: false; reason: 'gone' };

/** Every ghost vote these locks spent goes back to its seat, if the seat has not moved on since. */
export const returnGhostVotes = async (votes: BallotEntry[]): Promise<void> => {
  for (const entry of votes) {
    if (entry.vote.spent && entry.seat.state === 'spent') await setSeat(entry.seat.id, { state: 'dead' });
  }
};

/**
 * Rerolls one of the day's nominations against the grimoire as it stands:
 * it is no longer finalized, every lock comes off (a ghost vote it spent goes back), each hand's
 * snapshot and the count required are taken again, and the block is
 * recomputed. For the character effect the count could not see - the
 * accuser dying to a Witch, say - which the Storyteller applies in Seating
 * and then resets the nomination to notice. What the players wrote stays.
 *
 * Any nomination of the day, not only the latest: the Storyteller may learn
 * of the first one's effect only after the third is made. The later ones are
 * left as they were made; the Storyteller resets those too if the change
 * reaches them.
 */
export const resetNomination = async (client: Client, nomination: NominationRow): Promise<ResetResult> => {
  if (!(await getNomination(nomination.id))) return { ok: false, reason: 'gone' };

  const votes = await listVotes(nomination.id);
  for (const entry of votes) if (entry.vote.locked) await unlockVote(entry.vote.id);
  await returnGhostVotes(votes);

  const rows = await listSeating(nomination.game);
  const byId = new Map(rows.map((row) => [row.seat.id, row]));
  for (const entry of votes) {
    const now = byId.get(entry.seat.id);
    if (now) await resnapshotVote(entry.vote.id, now.seat.state);
  }
  await updateNomination(nomination.id, {
    required: requiredVotes(nomination.kind, rows.map(seatRef)),
    finalizedAt: null,
  });

  const siblings = await settleBlock(nomination.phase);
  await publish(client, [
    dayChanged(nomination.phase),
    gameEvents(nomination.game).Changed,
    ...siblings.map((n) => nominationChanged(n.id)),
  ]);
  return { ok: true };
};
