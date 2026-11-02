import type { Client } from 'discord.js';
import {
  listNominationsOfPhase,
  setBlock,
  updateNomination,
  type NominationRow,
} from '../../../../drizzle/nominations';
import { listSeating } from '../../../../drizzle/seating';
import { listVotes, resnapshotVote, unlockVote } from '../../../../drizzle/votes';
import { gameEvents } from '../../views/games/events';
import { dayChanged, nominationChanged } from '../../views/nominations/events';
import { setSeat } from '../seats';
import { publish } from './publish';
import { blockAfter, requiredVotes, statusOf, tally } from './rules';
import { seatRef } from './nominate';

export type ResetResult = { ok: true } | { ok: false; reason: 'notLatest' | 'gone' };

/**
 * Rerolls the day's latest nomination against the grimoire as it stands:
 * it is no longer finalized, every lock comes off (a ghost vote it spent goes back), each hand's
 * snapshot and the count required are taken again, and the block is
 * recomputed. For the character effect the count could not see - the
 * accuser dying to a Witch, say - which the Storyteller applies in Seating
 * and then resets the nomination to notice. What the players wrote stays.
 * Only the latest nomination, since an earlier one's reroll would leave the
 * later ones made against a grimoire that no longer held.
 */
export const resetNomination = async (client: Client, nomination: NominationRow): Promise<ResetResult> => {
  const siblings = await listNominationsOfPhase(nomination.phase);
  const latest = siblings[siblings.length - 1];
  if (!latest) return { ok: false, reason: 'gone' };
  if (latest.id !== nomination.id) return { ok: false, reason: 'notLatest' };

  const votes = await listVotes(nomination.id);
  for (const entry of votes) {
    if (!entry.vote.locked) continue;
    await unlockVote(entry.vote.id);
    if (entry.vote.spent && entry.seat.state === 'spent') await setSeat(entry.seat.id, { state: 'dead' });
  }

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

  const done = await Promise.all(
    siblings.map(async (n) => {
      const ballot = (await listVotes(n.id)).map((v) => v.vote);
      const required = n.id === nomination.id ? requiredVotes(nomination.kind, rows.map(seatRef)) : n.required;
      const finalized = n.id !== nomination.id && n.finalizedAt !== null;
      return { id: n.id, kind: n.kind, status: statusOf(ballot, required, finalized), tally: tally(ballot) };
    }),
  );
  await setBlock(nomination.phase, blockAfter(done));

  await publish(client, [
    dayChanged(nomination.phase),
    gameEvents(nomination.game).Changed,
    ...siblings.map((n) => nominationChanged(n.id)),
  ]);
  return { ok: true };
};
