import type { Client } from 'discord.js';
import { getQueue } from '../../../drizzle/queues';
import { getOrCreateGuildSettings } from '../../../drizzle/guild-settings';
import { logger } from '../../../utilities/logger';
import type { Game } from '../../../schema/core/games.sql';

type GameRow = typeof Game.$inferSelect;

export type ArchiveResult =
  | { ok: true; category: bigint }
  | { ok: false; reason: 'no-archive' | 'already-archived' | 'not-moved' };

/**
 * Where an ended game is filed: its queue's archive if the queue names one,
 * otherwise the server's default. Resolved when the game is archived rather
 * than when it is made, so a category set up after the fact still applies.
 */
export const archiveCategoryFor = async (game: GameRow): Promise<bigint | null> => {
  const queue = game.queue ? await getQueue(game.queue) : undefined;
  if (queue?.archive) return queue.archive;

  return (await getOrCreateGuildSettings(game.guild)).archive;
};

/**
 * Moves the game's channel to the top of its archive category, taking the
 * category's permissions so a read-only archive stays read-only. The game
 * itself is untouched: ending it is `endGame`, and the caller checks the
 * game has ended before coming here.
 */
export const archiveGame = async (client: Client, game: GameRow): Promise<ArchiveResult> => {
  const category = await archiveCategoryFor(game);
  if (category === null) return { ok: false, reason: 'no-archive' };

  try {
    const channel = await client.channels.fetch(String(game.channel));
    if (!channel || channel.isDMBased() || channel.isThread()) return { ok: false, reason: 'not-moved' };
    if (channel.parentId === String(category)) return { ok: false, reason: 'already-archived' };

    const moved = await channel.setParent(String(category), { lockPermissions: true, reason: 'Game archived' });
    await moved.setPosition(0, { reason: 'Game archived' });
  } catch (error) {
    logger.warn({ message: `Could not archive channel ${game.channel} of game ${game.id}.`, error });
    return { ok: false, reason: 'not-moved' };
  }

  return { ok: true, category };
};
