import type { Client } from 'discord.js';
import { updateGame } from '../../../drizzle/games';
import type { Game } from '../../../schema/core/games.sql';
import { fault } from '../errors/record';
import { rejectingRateLimits, waitOf } from '../rest/reject';
import { channelName, endedChannelName } from './names';

type GameRow = typeof Game.$inferSelect;

/** Discord renames a channel twice in ten minutes; past this, the Storyteller hears when rather than waiting. */
const RENAME_PATIENCE_MS = 5_000;

export type RenameResult =
  | { ok: true; game: GameRow }
  | { ok: false; reason: 'limited'; retryAt: Date }
  | { ok: false; reason: 'failed' };

/**
 * Renames a game in the record and on its channel: the plain title while it
 * runs, the date it ended in front once it has. The channel goes first, so a
 * refusal leaves the two agreeing; the end and the archive name the channel
 * from the record, so a channel renamed alone would revert there.
 */
export const renameGame = async (client: Client, game: GameRow, name: string): Promise<RenameResult> => {
  const target = game.state === 'completed' ? endedChannelName(name, game.endedAt ?? new Date()) : channelName(name);

  try {
    const channel = await client.channels.fetch(String(game.channel));
    if (!channel || !('setName' in channel)) return { ok: false, reason: 'failed' };
    if (channel.name !== target) {
      await rejectingRateLimits(RENAME_PATIENCE_MS, async () => {
        await channel.setName(target, 'Game renamed');
      });
    }
  } catch (error) {
    if (error instanceof Error && error.name.startsWith('RateLimitError')) {
      return { ok: false, reason: 'limited', retryAt: new Date(Date.now() + waitOf(error as never)) };
    }
    fault('game.rename', 'failed', error, { game: game.id, channel: game.channel });
    return { ok: false, reason: 'failed' };
  }

  return { ok: true, game: (await updateGame(game.id, { name })) ?? { ...game, name } };
};
