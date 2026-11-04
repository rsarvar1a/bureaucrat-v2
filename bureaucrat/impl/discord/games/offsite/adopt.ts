import type { TextChannel } from 'discord.js';
import { getGameByChannel, insertGame } from '../../../../drizzle/games';
import type { Game } from '../../../../schema/core/games.sql';
import { parseDateStamp, titleFromChannelName } from '../names';

type GameRow = typeof Game.$inferSelect;

export type Adoption = { game: GameRow; adopted: boolean } | { game: null; reason: 'elsewhere' | 'unfinished' };

/**
 * The game a channel is the record of, made up if the record has none: an
 * older bot's game is a bare ended game named after the channel, dated by
 * the stamp in its name or else by when the channel was made. A channel of
 * another server's game, or of one still running, is refused.
 */
export const gameOfChannel = async (channel: TextChannel, guild: bigint, creator: bigint): Promise<Adoption> => {
  const existing = await getGameByChannel(BigInt(channel.id));
  if (existing && existing.guild !== guild) return { game: null, reason: 'elsewhere' };
  if (existing && existing.state !== 'completed') return { game: null, reason: 'unfinished' };
  if (existing) return { game: existing, adopted: false };

  const game = await insertGame({
    guild,
    channel: BigInt(channel.id),
    creator,
    name: titleFromChannelName(channel.name),
    state: 'completed',
    endedAt: parseDateStamp(channel.name) ?? channel.createdAt,
  });
  return { game, adopted: true };
};
