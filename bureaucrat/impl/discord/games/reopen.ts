import type { Client, TextBasedChannel } from 'discord.js';
import type { SpawnTarget } from '../../../engine/discord/views/lifecycle';
import { listViews } from '../../../engine/discord/views/query';
import { writable } from '../../../engine/discord/views/threads';
import { closeWindow, openWindow, type Spawn } from '../../../engine/discord/views/windows';
import { listManagedThreads } from '../../../drizzle/managed-threads';
import type { Game } from '../../../schema/core/games.sql';
import { CONFIG_HEADER } from './create';

type GameRow = typeof Game.$inferSelect;

export type ReopenResult = { ok: true; thread: bigint } | { ok: false; reason: 'no-config-thread' };

/**
 * A fresh config stack in GAME CONFIG, after whatever was there is taken
 * down: a lost message, a stale one from before a deploy, or a stack that
 * never opened. Closing first means a half-deleted old copy is never left
 * beside the new one.
 */
export const reopenConfig = async (
  client: Client,
  spawn: Spawn,
  target: SpawnTarget,
  game: GameRow,
): Promise<ReopenResult> => {
  const [row] = await listManagedThreads(game.id, 'config');
  if (!row) return { ok: false, reason: 'no-config-thread' };

  const channel = await client.channels.fetch(String(row.thread)).catch(() => null);
  if (!channel || !('send' in channel)) return { ok: false, reason: 'no-config-thread' };
  await writable(channel);

  for (const header of await listViews({ route: CONFIG_HEADER, entityId: game.id })) {
    await closeWindow(client, header);
  }

  await openWindow(spawn, { ...target, channel: channel as TextBasedChannel }, CONFIG_HEADER, {
    entityId: game.id,
  });

  return { ok: true, thread: row.thread };
};
