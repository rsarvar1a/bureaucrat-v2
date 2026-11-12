import type { Client } from 'discord.js';
import { listViews } from '../../../../engine/discord/views/query';
import { closeWindow } from '../../../../engine/discord/views/windows';
import { deleteNomination, getNomination, type NominationRow } from '../../../../drizzle/nominations';
import { listVotes } from '../../../../drizzle/votes';
import { gameEvents } from '../../views/games/events';
import { dayChanged, nominationChanged } from '../../views/nominations/events';
import { settleBlock } from './block';
import { CONSOLE, NOMINATION_CARD } from './open';
import { publish } from './publish';
import { returnGhostVotes } from './reset';

export type CloseResult = { ok: true } | { ok: false; reason: 'gone' };

/**
 * Takes a nomination back as if it was never made: its card and every
 * Storyteller console on it come down, a ghost vote it spent goes back, and
 * the row goes with its ballot, so its nominator may nominate again and its
 * nominee be nominated. For the player who would not have nominated had they
 * known what an earlier nomination did. The block settles on what is left.
 */
export const closeNomination = async (client: Client, nomination: NominationRow): Promise<CloseResult> => {
  if (!(await getNomination(nomination.id))) return { ok: false, reason: 'gone' };

  await returnGhostVotes(await listVotes(nomination.id));

  // The card first: its consoles are its children and go with it. Any left are closed after.
  for (const card of await listViews({ route: NOMINATION_CARD, entityId: nomination.id })) {
    await closeWindow(client, card);
  }
  for (const pane of await listViews({ route: CONSOLE, entityId: nomination.id })) {
    await closeWindow(client, pane);
  }

  await deleteNomination(nomination.id);

  const siblings = await settleBlock(nomination.phase);
  await publish(client, [
    dayChanged(nomination.phase),
    gameEvents(nomination.game).Changed,
    ...siblings.map((n) => nominationChanged(n.id)),
  ]);
  return { ok: true };
};
