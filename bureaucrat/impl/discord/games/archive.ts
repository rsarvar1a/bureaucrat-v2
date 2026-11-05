import type { CategoryChannel, Client } from 'discord.js';
import { getQueue, updateQueue } from '../../../drizzle/queues';
import { getOrCreateGuildSettings, updateGuildSettings } from '../../../drizzle/guild-settings';
import { logger } from '../../../utilities/logger';
import type { Game } from '../../../schema/core/games.sql';
import { chainOf, inChain, placeInChain } from './archives/categories';

type GameRow = typeof Game.$inferSelect;

export type ArchiveResult =
  | { ok: true; category: bigint }
  | { ok: false; reason: 'no-archive' | 'already-archived' | 'not-moved' };

/** An archive category and the setting that names it, so a rollover can be written back to the right place. */
export type Filing = { category: bigint; pivot: (next: CategoryChannel) => Promise<void> };

/**
 * Where an ended game is filed: its queue's archive if the queue names one,
 * otherwise the server's default. Resolved when the game is archived rather
 * than when it is made, so a category set up after the fact still applies.
 */
export const archiveFilingFor = async (game: GameRow): Promise<Filing | null> => {
  const queue = game.queue ? await getQueue(game.queue) : undefined;
  if (queue?.archive) {
    return {
      category: queue.archive,
      pivot: async (next) => {
        await updateQueue(queue.id, { archive: BigInt(next.id) });
      },
    };
  }

  const settings = await getOrCreateGuildSettings(game.guild);
  if (settings.archive === null) return null;
  return {
    category: settings.archive,
    pivot: async (next) => {
      await updateGuildSettings(game.guild, { archive: BigInt(next.id) });
    },
  };
};

/**
 * Moves the game's channel to the top of its archive category, taking the
 * category's permissions so a read-only archive stays read-only. A full
 * category rolls the chain over first (`archives/categories.ts`) and the
 * setting follows. The game itself is untouched: ending it is `endGame`, and
 * the caller checks the game has ended before coming here.
 */
export const archiveGame = async (client: Client, game: GameRow): Promise<ArchiveResult> => {
  const filing = await archiveFilingFor(game);
  if (filing === null) return { ok: false, reason: 'no-archive' };

  try {
    const channel = await client.channels.fetch(String(game.channel));
    if (!channel || channel.isDMBased() || channel.isThread()) return { ok: false, reason: 'not-moved' };

    const chain = await chainOf(channel.guild, filing.category);
    if (!chain) return { ok: false, reason: 'no-archive' };
    if (inChain(chain, channel)) return { ok: false, reason: 'already-archived' };

    const room = await placeInChain(channel.guild, filing.category, filing.pivot, async (category) => {
      const moved = await channel.setParent(category, { lockPermissions: true, reason: 'Game archived' });
      await moved.setPosition(0, { reason: 'Game archived' });
    });
    if (!room) return { ok: false, reason: 'no-archive' };
    return { ok: true, category: BigInt(room.category.id) };
  } catch (error) {
    logger.warn({ message: `Could not archive channel ${game.channel} of game ${game.id}.`, error });
    return { ok: false, reason: 'not-moved' };
  }
};
