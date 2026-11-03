import type { Client, TextBasedChannel } from 'discord.js';
import { listViews } from '../../../engine/discord/views/query';
import { writable } from '../../../engine/discord/views/threads';
import { closeWindow } from '../../../engine/discord/views/windows';
import { getOrCreateGameSettings } from '../../../drizzle/game-settings';
import { getGame } from '../../../drizzle/games';
import { listManagedThreads } from '../../../drizzle/managed-threads';
import type { Game } from '../../../schema/core/games.sql';
import { spawnByRoute } from './create';
import { placeTownSquare, type PlaceResult } from './town-square';

type GameRow = typeof Game.$inferSelect;

export const SCRIPT_CARD = 'gscriptcard';

/**
 * Puts the public script card where the settings say, and nowhere else: the
 * copy there comes down first, so a rebinding or a new upload replaces it
 * rather than doubling it (it carries the files, so it never re-renders in
 * place). The players' ephemeral copies from `/game script` are not touched.
 * When the town square shares the thread it is placed again afterwards, so
 * the thread reads script, then seating.
 */
export const placeScriptCard = async (client: Client, game: GameRow): Promise<PlaceResult> => {
  for (const row of await listViews({ route: SCRIPT_CARD, entityId: game.id, visibility: 'public' })) {
    await closeWindow(client, row);
  }

  if (game.state !== 'running') return 'closed';
  const settings = await getOrCreateGameSettings(game.id);
  if (!settings.scriptThread) return 'closed';

  const thread = (await listManagedThreads(game.id, 'public')).find((t) => t.tag === settings.scriptThread);
  const channel = thread ? await client.channels.fetch(String(thread.thread)).catch(() => null) : null;
  if (!channel || !('send' in channel)) return 'no-thread';

  await writable(channel);
  await spawnByRoute(
    SCRIPT_CARD,
    { client, channel: channel as TextBasedChannel },
    { entityId: game.id, ids: { gconfig: game.id }, visibility: 'public' },
  );

  if (settings.seatingThread === settings.scriptThread) await placeTownSquare(client, game);
  return 'opened';
};

/** After the script changes: the public card is re-placed, since it cannot redraw its files in place. */
export const replaceScriptCard = async (client: Client, gameId: string): Promise<void> => {
  const game = await getGame(gameId);
  if (game && game.state === 'running') await placeScriptCard(client, game);
};
