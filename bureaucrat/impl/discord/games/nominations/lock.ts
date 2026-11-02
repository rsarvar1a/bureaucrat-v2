import type { Client } from 'discord.js';
import {
  listNominationsOfPhase,
  setBlock,
  updateNomination,
  type NominationRow,
} from '../../../../drizzle/nominations';
import { listVotes, lockVotes, markSpent, unlockVotes } from '../../../../drizzle/votes';
import { gameEvents } from '../../views/games/events';
import { dayChanged, nominationChanged } from '../../views/nominations/events';
import { setSeat } from '../seats';
import { publish } from './publish';
import { blockAfter, mayFinalize, spendsGhostVote, statusOf, tally, type Status } from './rules';

export type Decision = { yes: boolean; weight: number };

export type LockResult =
  | { ok: true; status: Status }
  | { ok: false; reason: 'nothingToLock' | 'handsUp' | 'alreadyFinal' };

/**
 * The day's block, recomputed over every nomination of the day once this one
 * is called, and every card of the day repainted since the block may have
 * moved between them.
 */
const settle = async (client: Client, nomination: NominationRow, seatsChanged: boolean): Promise<Status> => {
  const fresh = (await listNominationsOfPhase(nomination.phase)).find((n) => n.id === nomination.id) ?? nomination;
  const votes = await listVotes(nomination.id);
  const status = statusOf(
    votes.map((v) => v.vote),
    fresh.required,
    fresh.finalizedAt !== null,
  );

  const labels = [nominationChanged(nomination.id), dayChanged(nomination.phase)];
  if (seatsChanged) labels.push(gameEvents(nomination.game).Changed);

  const siblings = await listNominationsOfPhase(nomination.phase);
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
  await setBlock(nomination.phase, blockAfter(done));
  for (const n of siblings) if (n.id !== nomination.id) labels.push(nominationChanged(n.id));

  await publish(client, labels);
  return status;
};

const repaint = async (client: Client, nomination: NominationRow): Promise<Status> => {
  const votes = await listVotes(nomination.id);
  await publish(client, [nominationChanged(nomination.id), dayChanged(nomination.phase)]);
  return statusOf(
    votes.map((v) => v.vote),
    nomination.required,
    nomination.finalizedAt !== null,
  );
};

/**
 * Ghost votes on a finalized count: a yes from a seat dead at the snapshot,
 * on anything but an exile, spends the seat's ghost vote unless another
 * nomination got there first, and `Vote.spent` remembers whether this one
 * did. Returns whether any seat changed.
 */
const spendGhostVotes = async (nomination: NominationRow): Promise<boolean> => {
  let changed = false;
  for (const entry of await listVotes(nomination.id)) {
    if (entry.vote.spent) continue;
    if (!spendsGhostVote(nomination.kind, entry.vote.state, entry.vote.locked && entry.vote.yes === true)) continue;
    if (entry.seat.state === 'spent') continue;
    await setSeat(entry.seat.id, { state: 'spent' });
    await markSpent(entry.vote.id, true);
    changed = true;
  }
  return changed;
};

/** Hands about to change give back the ghost vote they spent, so the pass after decides afresh. */
const releaseGhostVotes = async (nomination: NominationRow, seatIds: string[]): Promise<boolean> => {
  let changed = false;
  for (const entry of await listVotes(nomination.id)) {
    if (!seatIds.includes(entry.seat.id) || !entry.vote.spent) continue;
    if (entry.seat.state === 'spent') await setSeat(entry.seat.id, { state: 'dead' });
    await markSpent(entry.vote.id, false);
    changed = true;
  }
  return changed;
};

/**
 * Writes a change to some hands. Before the count is finalized that is all:
 * nothing is counted and no ghost vote goes. After it, the Storyteller is
 * not locked out - the change is pushed straight through: ghost votes are
 * reconciled, the status re-read and the day's block recomputed.
 */
const change = async (
  client: Client,
  nomination: NominationRow,
  seatIds: string[],
  decision: Decision | null,
): Promise<LockResult> => {
  if (seatIds.length === 0) return { ok: false, reason: 'nothingToLock' };
  const released = await releaseGhostVotes(nomination, seatIds);
  if (decision)
    await lockVotes(nomination.id, seatIds, { yes: decision.yes, weight: decision.yes ? decision.weight : 0 });
  else await unlockVotes(nomination.id, seatIds);

  if (!nomination.finalizedAt) return { ok: true, status: await repaint(client, nomination) };
  const spent = await spendGhostVotes(nomination);
  return { ok: true, status: await settle(client, nomination, released || spent) };
};

/** Locks the chosen seats' hands as the Storyteller decided; a seat locked again is overwritten. */
export const lockSeats = (client: Client, nomination: NominationRow, seatIds: string[], decision: Decision) =>
  change(client, nomination, seatIds, decision);

export const unlockSeats = (client: Client, nomination: NominationRow, seatIds: string[]) =>
  change(client, nomination, seatIds, null);

/** Every hand still up comes down as a no. */
export const defaultRest = async (client: Client, nomination: NominationRow): Promise<LockResult> => {
  const votes = await listVotes(nomination.id);
  const open = votes.filter((v) => !v.vote.locked).map((v) => v.seat.id);
  if (open.length === 0) return { ok: false, reason: 'nothingToLock' };
  return change(client, nomination, open, { yes: false, weight: 0 });
};

/**
 * Calls the count: every hand must be locked. Ghost votes are spent, the
 * status read and the day's block recomputed; any change after is pushed
 * through the same way.
 */
export const finalize = async (client: Client, nomination: NominationRow): Promise<LockResult> => {
  if (nomination.finalizedAt) return { ok: false, reason: 'alreadyFinal' };
  const votes = await listVotes(nomination.id);
  if (!mayFinalize(votes.map((v) => v.vote))) return { ok: false, reason: 'handsUp' };

  await updateNomination(nomination.id, { finalizedAt: new Date() });
  const spent = await spendGhostVotes({ ...nomination, finalizedAt: new Date() });
  return { ok: true, status: await settle(client, nomination, spent) };
};
