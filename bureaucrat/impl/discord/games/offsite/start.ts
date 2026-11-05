import type { Client, TextBasedChannel } from 'discord.js';
import { listViews } from '../../../../engine/discord/views/query';
import { closeWindow } from '../../../../engine/discord/views/windows';
import {
  deleteExport,
  getExportOfGame,
  insertExport,
  listChannels,
  listCopiedExportsOwedPrivate,
  updateExport,
  type GameExportRow,
} from '../../../../drizzle/game-exports';
import { getGame } from '../../../../drizzle/games';
import { getOrCreateGuildSettings } from '../../../../drizzle/guild-settings';
import type { Game } from '../../../../schema/core/games.sql';
import { logger } from '../../../../utilities/logger';
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

/**
 * The copy a game gets without being asked, when the server has turned
 * that on (`/archives manage`): started at the end of the game, the card
 * placed, and anything wrong logged rather than thrown, since the game has
 * ended either way.
 */
export const autoExport = async (client: Client, game: GameRow): Promise<void> => {
  try {
    const settings = await getOrCreateGuildSettings(game.guild);
    if (!settings.offsiteAuto || settings.offsiteGuild === null) return;
    const result = await startExport(game, { copy: true, fresh: false });
    if (result.ok) await placeOffsiteCard(client, game);
  } catch (error) {
    logger.warn({ message: `Could not start the automatic offsite copy of game ${game.id}.`, error });
  }
};

/**
 * One finished copy back through the engine for its private threads: to
 * the reader first if it never saw them all, which lists them again and
 * reads only what is new, then to the copier, which sends only what is not
 * yet copied.
 */
export const sendBackForPrivate = async (exp: GameExportRow): Promise<void> => {
  await updateExport(exp.id, { state: exp.privateListed ? 'copying' : 'reading', copy: true, error: null });
};

/**
 * Sends a guild's finished copies back through the copier for the private
 * threads they left out, each with its card again. What a server does when
 * it turns private threads on; `/archives offsite sync` does the same for
 * any it finds. Returns how many were queued.
 */
export const requeueForPrivate = async (client: Client, guild: bigint): Promise<number> => {
  let queued = 0;
  for (const exp of await listCopiedExportsOwedPrivate(guild)) {
    await sendBackForPrivate(exp);
    const game = await getGame(exp.game);
    if (game) await placeOffsiteCard(client, game);
    queued += 1;
  }
  return queued;
};
