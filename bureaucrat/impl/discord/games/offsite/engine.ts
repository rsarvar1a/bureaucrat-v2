import type { Client } from 'discord.js';
import { notifyContexts } from '../../../../engine/discord/views/notify';
import {
  cloneRead,
  getExport,
  listChannels,
  listClaimableExports,
  readSiblingOf,
  updateExport,
  type GameExportRow,
} from '../../../../drizzle/game-exports';
import { getGame } from '../../../../drizzle/games';
import { listDestinationsAwaitingReflow, updateDestination } from '../../../../drizzle/offsite';
import { logger } from '../../../../utilities/logger';
import { offsiteEvents } from '../../views/games/offsite/events';
import { reflowChain } from '../archives/categories';
import { stampByName } from '../archives/stamps';
import { readGame } from './read';
import { copyGame, destinationOf } from './write';
import { offsiteConcurrency } from '../../../../utilities/pool';

/** How often unfinished exports are looked for. */
export const TICK_MS = 15_000;

/** The card is redrawn at most this often while a job runs; the final state always gets through. */
const REPORT_MS = 5_000;

const running = new Set<string>();
/** Games with an export running: a second export of one waits, so it can clone the first's read. */
const busyGames = new Set<string>();

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
    // A game already read for another destination is cloned, not read from Discord again.
    if (exp.state === 'reading' && (await listChannels(exp.id)).length === 0) {
      const sibling = await readSiblingOf(exp);
      if (sibling) {
        await cloneRead(sibling, exp);
        exp = await getExport(exp.id);
      }
    }
    if (exp?.state === 'reading') {
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
  for (const row of await listDestinationsAwaitingReflow()) {
    await updateDestination(row.id, { reflowPending: false });
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
    }
  }
};

/**
 * How many exports run at once. Each game writes through its own webhook,
 * and Discord's webhook limit is per webhook, so jobs do not slow each
 * other down until the global ceiling (about fifty requests a second, of
 * which one copy uses a twentieth). Copies into one destination meet only
 * at its chain's lock (`placeInChain`). Four is the default
 * (`utilities/pool.ts`); the environment overrides it.
 */
export const CONCURRENCY = offsiteConcurrency();

/**
 * Claims exports up to the cap and runs each in the background; a running
 * job's row is still in a claimable state, so the queue counts as drained
 * only when nothing at all is left to claim.
 */
export const tickOffsite = async (client: Client): Promise<void> => {
  const claimable = await listClaimableExports();
  if (claimable.length === 0) {
    await reflowOwed(client);
    return;
  }

  const open = CONCURRENCY - running.size;
  if (open <= 0) return;

  let started = 0;
  for (const exp of claimable) {
    if (started >= open) break;
    if (running.has(exp.id) || busyGames.has(exp.game)) continue;
    running.add(exp.id);
    busyGames.add(exp.game);
    started += 1;
    void run(client, exp)
      .catch((error: unknown) => logger.error({ message: `Offsite export ${exp.id} crashed.`, error }))
      .finally(() => {
        running.delete(exp.id);
        busyGames.delete(exp.game);
      });
  }
};

export const startOffsiteEngine = (client: Client): ReturnType<typeof setInterval> => {
  const tick = () => tickOffsite(client).catch((error) => logger.error({ message: 'Offsite tick failed.', error }));
  void tick();
  return setInterval(tick, TICK_MS);
};
