import type { Client, TextBasedChannel } from 'discord.js';
import { listViews } from '../../../engine/discord/views/query';
import { writable } from '../../../engine/discord/views/threads';
import { closeWindow } from '../../../engine/discord/views/windows';
import { getOrCreateGameSettings, updateGameSettings } from '../../../drizzle/game-settings';
import { listSeating } from '../../../drizzle/seating';
import { listManagedThreads } from '../../../drizzle/managed-threads';
import type { Game } from '../../../schema/core/games.sql';
import { spawnByRoute } from './create';
import { snapshot } from './published';

type GameRow = typeof Game.$inferSelect;

export const TOWN_SQUARE = 'gtownsquare';

export type PlaceResult = 'opened' | 'closed' | 'no-thread';

/** Freezes the seating as the players will see it; the caller raises `Published`. */
export const publishSeating = async (gameId: string) => {
  const rows = await listSeating(gameId);
  return updateGameSettings(gameId, { publishedSeating: snapshot(rows), publishedAt: new Date() });
};

/**
 * Puts the players' town square where the settings say, and nowhere else:
 * whatever copy exists comes down first, so a rebinding moves it rather than
 * doubling it. Nothing opens before Start, since the thread it is bound to
 * does not exist yet; Start calls this once the threads are made.
 */
export const placeTownSquare = async (client: Client, game: GameRow): Promise<PlaceResult> => {
  for (const row of await listViews({ route: TOWN_SQUARE, entityId: game.id })) await closeWindow(client, row);

  if (game.state !== 'running') return 'closed';
  const settings = await getOrCreateGameSettings(game.id);
  if (!settings.seatingThread) return 'closed';

  const thread = (await listManagedThreads(game.id, 'public')).find((t) => t.tag === settings.seatingThread);
  const channel = thread ? await client.channels.fetch(String(thread.thread)).catch(() => null) : null;
  if (!channel || !('send' in channel)) return 'no-thread';

  // A square that opens on a game never published shows what Start found.
  if (!settings.publishedSeating) await publishSeating(game.id);

  await writable(channel);
  // Parentless on purpose: it belongs to the game, not to any config window.
  await spawnByRoute(
    TOWN_SQUARE,
    { client, channel: channel as TextBasedChannel },
    // Told which game it belongs to, so `game::<id>::ended` resolves and takes it down.
    { entityId: game.id, ids: { gconfig: game.id } },
  );
  return 'opened';
};
