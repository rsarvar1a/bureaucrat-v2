import type { Client, TextBasedChannel } from 'discord.js';
import { getOrCreateGameSettings } from '../../../drizzle/game-settings';
import { listManagedThreads } from '../../../drizzle/managed-threads';
import type { Game, GameSettings } from '../../../schema/core/games.sql';

type GameRow = typeof Game.$inferSelect;
type Settings = typeof GameSettings.$inferSelect;

/** The settings columns that bind a feature to a planned public thread by its tag. */
export type Binding = {
  [K in keyof Settings]: Settings[K] extends string | null ? (K extends `${string}Thread` ? K : never) : never;
}[keyof Settings];

export type BoundChannel = { channel: TextBasedChannel; fellBack: boolean };

const sendable = async (client: Client, id: bigint | string): Promise<TextBasedChannel | null> => {
  const channel = await client.channels.fetch(String(id)).catch(() => null);
  return channel && 'send' in channel ? (channel as TextBasedChannel) : null;
};

/**
 * Where a bound feature lives: the planned public thread the setting names,
 * by its tag, or the game channel when none is bound. A bound thread that
 * is gone (or not yet made, before Start) falls back to the game channel and
 * says so, so the Storyteller hears.
 */
export const boundChannel = async (client: Client, game: GameRow, binding: Binding): Promise<BoundChannel | null> => {
  const settings = await getOrCreateGameSettings(game.id);
  const tag = settings[binding];
  if (tag) {
    const thread = (await listManagedThreads(game.id, 'public')).find((t) => t.tag === tag);
    const channel = thread ? await sendable(client, thread.thread) : null;
    if (channel) return { channel, fellBack: false };
  }
  const channel = await sendable(client, game.channel);
  return channel ? { channel, fellBack: tag !== null } : null;
};
