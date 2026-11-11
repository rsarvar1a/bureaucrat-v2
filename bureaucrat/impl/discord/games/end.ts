import type { Client } from 'discord.js';
import { notifyContexts } from '../../../engine/discord/views/notify';
import { updateGame } from '../../../drizzle/games';
import { recordOutcomes, type OutcomeInput } from '../../../drizzle/game-outcomes';
import { listManagedThreads } from '../../../drizzle/managed-threads';
import { logger } from '../../../utilities/logger';
import type { Game } from '../../../schema/core/games.sql';
import { gameEvents } from '../views/games/events';
import { endedChannelName } from './names';
import { deleteGameRoles } from './roles';
import { closeAllWhispers } from './whispers/close';
import { autoExport } from './offsite/start';

type GameRow = typeof Game.$inferSelect;

/**
 * Ends a game: the row is completed, its results and their winning players are
 * recorded (one result, or one per colour of a multicolour game), every view of it hears
 * `Ended` and detaches, its message left with its controls stripped as the record, its threads are archived and its channel is
 * renamed with the date in front, ready to be filed.
 *
 * The channel stays - it is the record of the game, and `/game archive`
 * moves it later; a server that copies games offsite automatically starts
 * that copy here - and the queue is told separately, by whoever called this,
 * because what a vacancy means is the queue's business rather than the game's.
 *
 * The game's tracked Discord roles (`roles.ts`) are deleted with it; the
 * Participant rows, which are the membership (ADR-005), stay as the record.
 */
export const endGame = async (client: Client, game: GameRow, outcomes: OutcomeInput[]): Promise<GameRow> => {
  const endedAt = new Date();
  const ended = (await updateGame(game.id, { state: 'completed', endedAt })) ?? game;
  await recordOutcomes(game.id, outcomes);

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

  // Last, after the rename: the copy takes the channel's new name.
  await autoExport(client, ended);

  return ended;
};
