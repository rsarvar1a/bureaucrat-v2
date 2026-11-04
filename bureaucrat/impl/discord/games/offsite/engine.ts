import type { Client } from 'discord.js';
import { notifyContexts } from '../../../../engine/discord/views/notify';
import { getExport, listClaimableExports, updateExport, type GameExportRow } from '../../../../drizzle/game-exports';
import { getGame } from '../../../../drizzle/games';
import { listGuildsAwaitingReflow, updateGuildSettings } from '../../../../drizzle/guild-settings';
import { logger } from '../../../../utilities/logger';
import { offsiteEvents } from '../../views/games/offsite/events';
import { reflowChain } from '../archives/categories';
import { stampByName } from '../archives/stamps';
import { readGame } from './read';
import { copyGame, destinationOf } from './write';

/** How often unfinished exports are looked for. */
export const TICK_MS = 15_000;

/** The card is redrawn at most this often while a job runs; the final state always gets through. */
const REPORT_MS = 5_000;

const running = new Set<string>();

const publish = async (client: Client, gameId: string): Promise<void> => {
  const { viewDefinitions } = await import('../../registry/views');
  await notifyContexts(client, viewDefinitions, [offsiteEvents(gameId).Changed]);
};

/** The counts written as they change; the card told no more often than `REPORT_MS`. */
const reporter = (client: Client, exp: GameExportRow) => {
  let last = 0;
  return async (patch: Parameters<typeof updateExport>[1]) => {
    await updateExport(exp.id, patch);
    const now = Date.now();
    if (now - last < REPORT_MS) return;
    last = now;
    await publish(client, exp.game).catch((error: unknown) => {
      logger.debug({ message: `Offsite card of game ${exp.game} could not be redrawn.`, error });
    });
  };
};

/** One export, run as far as it goes: reading, then copying if it was asked to. */
const run = async (client: Client, first: GameExportRow): Promise<void> => {
  const game = await getGame(first.game);
  if (!game) {
    await updateExport(first.id, { state: 'failed', error: 'The game is gone.' });
    return;
  }
  const report = reporter(client, first);

  try {
    let exp: GameExportRow | undefined = first;
    if (exp.state === 'reading') {
      await readGame(client, game, exp, (p) =>
        report({ channels: p.channels, messages: p.messages, unread: p.unread }),
      );
      exp = await getExport(exp.id);
    }
    if (exp?.state === 'copying') {
      await copyGame(client, game, exp, (p) => report({ copied: p.copied, messages: p.messages }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ message: `Offsite archive of game ${game.id} failed: ${message}`, error });
    await updateExport(first.id, { state: 'failed', error: message.slice(0, 500) });
  }
  await publish(client, game.id).catch(() => undefined);
};

/**
 * The reflows `/archives offsite sync` left owing, done once the queue is
 * empty so the last copy is in place to be ordered. The flag is cleared
 * before the work, so a reflow that fails is logged rather than repeated
 * every tick; the next sync sets it again.
 */
const reflowOwed = async (client: Client): Promise<void> => {
  for (const settings of await listGuildsAwaitingReflow()) {
    await updateGuildSettings(settings.guild, { offsiteReflowPending: false });
    try {
      const destination = await destinationOf(client, settings.guild);
      if (!destination.ok) throw new Error(destination.reason);
      const done = await reflowChain(destination.guild, BigInt(destination.category.id), stampByName);
      if (done) await updateGuildSettings(settings.guild, { offsiteCategory: BigInt(done.current.id) });
      logger.info({ message: `Archive server of guild ${settings.guild} reflowed after a sync.` });
    } catch (error) {
      logger.error({ message: `Archive server of guild ${settings.guild} could not be reflowed after a sync.`, error });
    }
  }
};

/** One job at a time per process: the writes are what take the time, and two would share the limit anyway. */
export const tickOffsite = async (client: Client): Promise<void> => {
  if (running.size > 0) return;
  const next = (await listClaimableExports()).find((exp) => !running.has(exp.id));
  if (!next) {
    await reflowOwed(client);
    return;
  }

  running.add(next.id);
  try {
    await run(client, next);
  } finally {
    running.delete(next.id);
  }
};

export const startOffsiteEngine = (client: Client): ReturnType<typeof setInterval> => {
  const tick = () => tickOffsite(client).catch((error) => logger.error({ message: 'Offsite tick failed.', error }));
  void tick();
  return setInterval(tick, TICK_MS);
};
