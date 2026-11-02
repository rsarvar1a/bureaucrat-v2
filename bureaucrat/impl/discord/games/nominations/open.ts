import type { Client } from 'discord.js';
import type { SpawnTarget } from '../../../../engine/discord/views/lifecycle';
import { listViews } from '../../../../engine/discord/views/query';
import { writable } from '../../../../engine/discord/views/threads';
import { closeWindow } from '../../../../engine/discord/views/windows';
import {
  claimNominationsOpen,
  closeNominations,
  getPhase,
  listOpenDays,
  reopenNominations,
} from '../../../../drizzle/game-phases';
import { getGame } from '../../../../drizzle/games';
import { listNominationsOfPhase, listNominationsOfPhases } from '../../../../drizzle/nominations';
import { listSpentVotesOfNominations } from '../../../../drizzle/votes';
import type { Game, GamePhase } from '../../../../schema/core/games.sql';
import { logger } from '../../../../utilities/logger';
import { gameEvents } from '../../views/games/events';
import { dayChanged, nominationChanged } from '../../views/nominations/events';
import { spawnByRoute } from '../create';
import { setSeat } from '../seats';
import { nominationChannel } from './thread';
import { S } from '../../../../strings';
import { roleMentions, trackedRoles } from '../roles';
import { publish } from './publish';

type GameRow = typeof Game.$inferSelect;
type PhaseRow = typeof GamePhase.$inferSelect;

export const DAY_CARD = 'gnomday';
export const NOMINATION_CARD = 'gnomination';
export const CONSOLE = 'gnomst';
/** The Storyteller's pane beside the day card: the block. */
export const BLOCK_PANE = 'gnomblock';

export type Interaction = Extract<SpawnTarget, { interaction: unknown }>['interaction'];

export type OpenResult = { outcome: 'opened' | 'already' | 'not-day' | 'no-channel'; fellBack: boolean };

/** Open: opened, not closed. Current-ness is the caller's to check. */
export const isOpen = (phase: Pick<PhaseRow, 'nominationsOpenedAt' | 'nominationsClosedAt'>): boolean =>
  phase.nominationsOpenedAt !== null && phase.nominationsClosedAt === null;

/** The day card and every card of the day: what a change to the day repaints. */
const dayLabels = async (phaseId: string): Promise<string[]> => [
  dayChanged(phaseId),
  ...(await listNominationsOfPhase(phaseId)).map((n) => nominationChanged(n.id)),
];

/**
 * Opens a day's nominations: claims the day (the timer and the Storyteller's
 * button cannot both win), closes any other day still open, and puts the day
 * card in the bound thread. A claim already made with no card to show for it
 * is a spawn that failed, and is retried.
 */
export const openNominations = async (
  client: Client,
  game: GameRow,
  phase: PhaseRow,
  interaction?: Interaction,
): Promise<OpenResult> => {
  if (phase.phase !== 'day') return { outcome: 'not-day', fellBack: false };

  const claimed = await claimNominationsOpen(phase.id);
  if (!claimed) {
    const [card] = await listViews({ route: DAY_CARD, entityId: phase.id });
    if (card) return { outcome: 'already', fellBack: false };
  }

  const where = await nominationChannel(client, game);
  if (!where) return { outcome: 'no-channel', fellBack: false };

  await closeOpenDays(client, game.id, phase.id);
  await writable(where.channel);
  const row = await spawnByRoute(
    DAY_CARD,
    interaction ? { interaction, channel: where.channel } : { client, channel: where.channel },
    // Told which game it belongs to, so `game::<id>::ended` takes it down.
    { entityId: phase.id, ids: { gconfig: game.id } },
  );

  // Best effort: the thread is where the players talk, and the card would scroll away.
  if ('messages' in where.channel) {
    await where.channel.messages
      .pin(String(row.message))
      .catch((error: unknown) => logger.debug({ message: 'Could not pin the day card.', error }));
  }

  await announceOpen(client, game, where.channel.id);
  return { outcome: 'opened', fellBack: where.fellBack };
};

/** The Players pinged in the game channel: nominations are open, and where the card is if not here. */
const announceOpen = async (client: Client, game: GameRow, cardChannel: string): Promise<void> => {
  const channel = await client.channels.fetch(String(game.channel)).catch(() => null);
  if (!channel || !channel.isSendable()) return;

  const who = roleMentions(['Player'], await trackedRoles(game.id));
  const where = cardChannel === channel.id ? null : `<#${cardChannel}>`;
  await channel
    .send({ content: S.games.nominationsOpen(who.text.join(' '), where), allowedMentions: { roles: who.ids } })
    .catch((error: unknown) => logger.warn({ message: `Could not announce nominations of game ${game.id}.`, error }));
};

export const closeDay = async (client: Client, phaseId: string): Promise<void> => {
  await closeNominations(phaseId);
  await publish(client, await dayLabels(phaseId));
};

export const reopenDay = async (client: Client, phaseId: string): Promise<void> => {
  await reopenNominations(phaseId);
  await publish(client, await dayLabels(phaseId));

  const phase = await getPhase(phaseId);
  const game = phase ? await getGame(phase.game) : undefined;
  const [card] = phase ? await listViews({ route: DAY_CARD, entityId: phase.id }) : [];
  if (game && card) await announceOpen(client, game, String(card.channel));
};

/** Closes every open day of the game but `except`; a phase move leaves no day open behind it. */
export const closeOpenDays = async (client: Client, gameId: string, except?: string): Promise<void> => {
  for (const day of await listOpenDays(gameId)) {
    if (day.id !== except) await closeDay(client, day.id);
  }
};

/**
 * Before a backward move deletes these phases: their cards come down (the
 * rows would otherwise outlive their entities) and every ghost vote a lock
 * spent in them is given back, since the nomination it was spent on is about
 * to have never happened.
 */
export const teardownPhases = async (client: Client, gameId: string, phaseIds: string[]): Promise<void> => {
  if (phaseIds.length === 0) return;
  const nominations = await listNominationsOfPhases(phaseIds);

  for (const vote of await listSpentVotesOfNominations(nominations.map((n) => n.id))) {
    await setSeat(vote.player, { state: 'dead' });
  }

  const cards = [
    ...(await listViews({ route: NOMINATION_CARD, entityIds: nominations.map((n) => n.id) })),
    ...(await listViews({ route: DAY_CARD, entityIds: phaseIds })),
  ];
  for (const card of cards) await closeWindow(client, card);

  if (nominations.length > 0) await publish(client, [gameEvents(gameId).Changed]);
};
