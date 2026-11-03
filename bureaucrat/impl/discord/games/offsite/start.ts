import type { Client, TextBasedChannel } from 'discord.js';
import { listViews } from '../../../../engine/discord/views/query';
import { closeWindow } from '../../../../engine/discord/views/windows';
import {
  deleteExport,
  getExportOfGame,
  insertExport,
  listChannels,
  updateExport,
  type GameExportRow,
} from '../../../../drizzle/game-exports';
import type { Game } from '../../../../schema/core/games.sql';
import { spawnByRoute } from '../create';

type GameRow = typeof Game.$inferSelect;

export const OFFSITE_CARD = 'goffsite';

/** The progress card, one per game, at the bottom of the game channel. */
export const placeOffsiteCard = async (client: Client, game: GameRow): Promise<void> => {
  for (const row of await listViews({ route: OFFSITE_CARD, entityId: game.id })) await closeWindow(client, row);
  const channel = await client.channels.fetch(String(game.channel)).catch(() => null);
  if (!channel || !('send' in channel)) return;
  await spawnByRoute(
    OFFSITE_CARD,
    { client, channel: channel as TextBasedChannel },
    { entityId: game.id, ids: { gconfig: game.id, goffsite: game.id } },
  );
};

export type StartResult = { ok: true; exp: GameExportRow } | { ok: false; reason: 'running' | 'done' | 'nothing' };

/**
 * Begins or resumes the game's export. `copy` says whether to carry on into
 * the archive server once read; `fresh` throws away a finished export and
 * starts over. An export in progress is left to the engine.
 */
export const startExport = async (game: GameRow, options: { copy: boolean; fresh: boolean }): Promise<StartResult> => {
  const existing = await getExportOfGame(game.id);

  if (existing && (existing.state === 'reading' || existing.state === 'copying')) {
    return { ok: false, reason: 'running' };
  }
  if (existing && options.fresh) {
    await deleteExport(existing.id);
  } else if (existing) {
    if (existing.state === 'copied') return { ok: false, reason: 'done' };
    if (existing.state === 'read') {
      if (!options.copy) return { ok: false, reason: 'done' };
      const exp = await updateExport(existing.id, { state: 'copying', copy: true, error: null });
      return { ok: true, exp: exp! };
    }
    // Failed: back to whichever stage it was in.
    const stage = await stageOf(existing);
    const exp = await updateExport(existing.id, { state: stage, copy: existing.copy || options.copy, error: null });
    return { ok: true, exp: exp! };
  }

  const exp = await insertExport({ game: game.id, state: 'reading', copy: options.copy, startedAt: new Date() });
  return { ok: true, exp };
};

/** Where a failed export picks up: reading unless every channel was read, then copying if it was meant to copy. */
export const stageOf = async (exp: GameExportRow): Promise<'reading' | 'copying' | 'read'> => {
  const channels = await listChannels(exp.id);
  const allRead = channels.length > 0 && channels.every((c) => c.readDone);
  if (!allRead) return 'reading';
  return exp.copy ? 'copying' : 'read';
};

/** Retry from the card: the same as starting again, without the fresh option. */
export const retryExport = async (exp: GameExportRow): Promise<GameExportRow | undefined> => {
  if (exp.state !== 'failed') return exp;
  return updateExport(exp.id, { state: await stageOf(exp), error: null });
};
