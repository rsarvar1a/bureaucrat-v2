import type { Client } from 'discord.js';
import { notifyContexts } from '../../../../engine/discord/views/notify';
import {
  cloneRead,
  listChannels,
  listClaimableExports,
  readSiblingOf,
  updateExport,
  type GameExportRow,
} from '../../../../drizzle/game-exports';
import { getGame } from '../../../../drizzle/games';
import type { Game } from '../../../../schema/core/games.sql';
import { listDestinationsAwaitingReflow, updateDestination } from '../../../../drizzle/offsite';
import { S } from '../../../../strings';
import { logger } from '../../../../utilities/logger';
import { offsiteEvents } from '../../views/games/offsite/events';
import { reflowChain } from '../archives/categories';
import { stampByName } from '../archives/stamps';
import { readGame } from './read';
import { Deferred } from './gate';
import { schedule, type Phase, type Running } from './schedule';
import { copyGame, destinationOf } from './write';
import { offsiteReaders, offsiteWriters } from '../../../../utilities/pool';
import { classify, isTransient } from '../../errors/classify';
import { fault, faultScope, swallow } from '../../errors/record';

/** How often unfinished exports are looked for. */
export const TICK_MS = 15_000;

/** The card is redrawn at most this often while a job runs; the final state always gets through. */
const REPORT_MS = 5_000;

/** Exports running now, by id, with their phase and game (see `schedule.ts`). */
const running = new Map<string, Running>();

type GameRow = typeof Game.$inferSelect;

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
      fault('card.publish', 'ignored', error);
    });
  };
};

/** The read: cloned from a sibling export already read for another destination, else from Discord. */
const read = async (
  client: Client,
  game: GameRow,
  exp: GameExportRow,
  report: ReturnType<typeof reporter>,
): Promise<void> => {
  if ((await listChannels(exp.id)).length === 0) {
    const sibling = await readSiblingOf(exp);
    if (sibling) {
      await cloneRead(sibling, exp);
      return;
    }
  }
  await readGame(client, game, exp, (p) => report({ channels: p.channels, messages: p.messages, unread: p.unread }));
};

/**
 * One phase of one export: its read, or its copy. A read that ends in
 * `copying` goes back to the queue for a writer's slot. A copy that meets
 * Discord's thread limit is deferred, not failed: it keeps everything it
 * did and is claimed again once the window opens.
 */
const run = async (client: Client, exp: GameExportRow): Promise<void> => {
  const game = await getGame(exp.game);
  if (!game) {
    await updateExport(exp.id, { state: 'failed', error: 'The game is gone.' });
    return;
  }
  const report = reporter(client, exp);

  try {
    if (exp.notBefore !== null) await updateExport(exp.id, { notBefore: null });
    if (exp.state === 'reading') await read(client, game, exp, report);
    else await copyGame(client, game, exp, (p) => report({ copied: p.copied, messages: p.messages }));
  } catch (error) {
    if (error instanceof Deferred) {
      logger.debug({ message: `Offsite copy of game ${game.id} deferred until ${error.until.toISOString()}.` });
      await updateExport(exp.id, { notBefore: error.until });
    } else {
      // The classified message: a query wrapper's own quotes the statement's parameters.
      const { message } = classify(error);
      const stopped = isTransient(error) ? S.errors.offsiteTransient(message) : message;
      logger.error({ message: `Offsite archive of game ${game.id} failed: ${message}`, error });
      fault('export', 'failed', error, { detail: { state: exp.state, transient: isTransient(error) } });
      await updateExport(exp.id, { state: 'failed', error: stopped.slice(0, 500) });
    }
  }
  await publish(client, game.id).catch(swallow('card.publish', 'ignored', undefined));
};

/**
 * The reflows `/archives offsite sync` left owing, done once the queue is
 * empty so the last copy is in place to be ordered. The flag is cleared
 * before the work, so a reflow that fails is logged rather than repeated
 * every tick; the next sync sets it again.
 */
const reflowOwed = async (client: Client): Promise<void> => {
  for (const row of await listDestinationsAwaitingReflow()) {
    await updateDestination(row.id, { reflowPending: false });
    await faultScope({ area: 'offsite', guild: row.destGuild }, async () => {
      try {
        const destination = await destinationOf(client, row);
        if (!destination.ok) throw new Error(destination.reason);
        const done = await reflowChain(destination.guild, BigInt(destination.category.id), stampByName);
        if (done) await updateDestination(row.id, { category: BigInt(done.current.id) });
        logger.info({ message: `Archive ${row.category} on ${row.destGuild} reflowed after a sync.` });
      } catch (error) {
        logger.error({
          message: `Archive ${row.category} on ${row.destGuild} could not be reflowed after a sync.`,
          error,
        });
        fault('reflow', 'failed', error, { detail: { destination: row.id } });
      }
    });
  }
};

/** Slots per phase (`utilities/pool.ts`): a few readers fill the bot's request budget; writers can run high. */
export const SLOTS: Record<Phase, number> = { reading: offsiteReaders(), copying: offsiteWriters() };

/**
 * Starts what `schedule` picks and runs each in the background. A running
 * or deferred job's row is still unfinished, so the queue counts as drained
 * only when nothing at all is left, deferred copies included.
 */
export const tickOffsite = async (client: Client): Promise<void> => {
  const unfinished = await listClaimableExports();
  if (unfinished.length === 0) {
    await reflowOwed(client);
    return;
  }

  const claimable = unfinished.filter(
    (exp): exp is GameExportRow & { state: Phase } => exp.state === 'reading' || exp.state === 'copying',
  );
  for (const exp of schedule(claimable, running, SLOTS, new Date())) {
    running.set(exp.id, { phase: exp.state, game: exp.game });
    void faultScope({ area: 'offsite', game: exp.game, export: exp.id }, () => run(client, exp))
      .catch((error: unknown) => {
        logger.error({ message: `Offsite export ${exp.id} crashed.`, error });
        fault('export.crash', 'failed', error, { area: 'offsite', game: exp.game, export: exp.id });
      })
      .finally(() => {
        running.delete(exp.id);
        // A freed slot, or a read handing over to a writer, need not wait for the next tick.
        kick();
      });
  }
};

let kick: () => void = () => undefined;

export const startOffsiteEngine = (client: Client): ReturnType<typeof setInterval> => {
  // Ticks never overlap: one asked for during a tick runs straight after it.
  let ticking = false;
  let again = false;
  const tick = async (): Promise<void> => {
    if (ticking) {
      again = true;
      return;
    }
    ticking = true;
    try {
      do {
        again = false;
        await faultScope({ area: 'offsite' }, () => tickOffsite(client)).catch((error: unknown) => {
          logger.error({ message: 'Offsite tick failed.', error });
          fault('tick', 'failed', error, { area: 'offsite' });
        });
      } while (again);
    } finally {
      ticking = false;
    }
  };
  kick = () => void tick();
  kick();
  return setInterval(kick, TICK_MS);
};
