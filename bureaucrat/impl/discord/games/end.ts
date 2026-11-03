import type { Client } from 'discord.js';
import { notifyContexts } from '../../../engine/discord/views/notify';
import { updateGame } from '../../../drizzle/games';
import { insertGameWinners, type WinnerInput } from '../../../drizzle/game-winners';
import type { Alignment } from './script/alignment';
import { listManagedThreads } from '../../../drizzle/managed-threads';
import { logger } from '../../../utilities/logger';
import type { Game } from '../../../schema/core/games.sql';
import { gameEvents } from '../views/games/events';
import { endedChannelName } from './names';
import { deleteGameRoles } from './roles';
import { closeAllWhispers } from './whispers/close';

type GameRow = typeof Game.$inferSelect;

/** What the Storyteller declares at the end: the team, and who was on it. */
export type Outcome = { winner: Alignment; winners: WinnerInput[] };

/**
 * Ends a game: the row is completed with its winner, the winning players are
 * recorded, every window in its stack hears
 * `Ended` and takes itself down, its threads are archived and its channel is
 * renamed with the date in front, ready to be filed.
 *
 * The channel stays - it is the record of the game, and `/game archive`
 * moves it later - and the queue is told separately, by whoever called this,
 * because what a vacancy means is the queue's business rather than the game's.
 *
 * The game's tracked Discord roles (`roles.ts`) are deleted with it; the
 * Participant rows, which are the membership (ADR-005), stay as the record.
 */
export const endGame = async (client: Client, game: GameRow, outcome: Outcome): Promise<GameRow> => {
  const endedAt = new Date();
  const ended = (await updateGame(game.id, { state: 'completed', winner: outcome.winner, endedAt })) ?? game;
  await insertGameWinners(outcome.winners.map((w) => ({ ...w, game: game.id })));

  const { viewDefinitions } = await import('../registry/views');
  await notifyContexts(client, viewDefinitions, [gameEvents(game.id).Ended]);

  await deleteGameRoles(client, game);
  await closeAllWhispers(client, game, 'night');

  for (const row of await listManagedThreads(game.id)) {
    try {
      const thread = await client.channels.fetch(String(row.thread));
      if (thread?.isThread() && !thread.archived) await thread.setArchived(true, 'Game ended');
    } catch (error) {
      logger.debug({ message: `Could not archive thread ${row.thread} of game ${game.id}.`, error });
    }
  }

  try {
    const channel = await client.channels.fetch(String(game.channel));
    if (channel && 'setName' in channel) await channel.setName(endedChannelName(game.name, endedAt), 'Game ended');
  } catch (error) {
    logger.warn({ message: `Could not rename channel ${game.channel} of ended game ${game.id}.`, error });
  }

  return ended;
};
