import type { Client } from 'discord.js';
import { currentPhase, listDaysAwaitingAutoOpen } from '../../../../drizzle/game-phases';
import { logger } from '../../../../utilities/logger';
import { TICK_MS } from '../reminders/engine';
import { openNominations } from './open';

type DayLike = {
  phase: 'night' | 'day';
  createdAt: Date;
  nominationsOpenedAt: Date | null;
  nominationsClosedAt: Date | null;
};

/** A day, never opened or closed, that has been running for `after` seconds. */
export const dueForAutoOpen = (phase: DayLike, after: number | null, now: Date): boolean =>
  after !== null &&
  phase.phase === 'day' &&
  phase.nominationsOpenedAt === null &&
  phase.nominationsClosedAt === null &&
  phase.createdAt.getTime() + after * 1000 <= now.getTime();

/** One pass: every day whose timer has run out, and is still the day, opens. */
export const tickNominations = async (client: Client, now = new Date()): Promise<void> => {
  for (const { phase, game, after } of await listDaysAwaitingAutoOpen(now)) {
    if (!dueForAutoOpen(phase, after, now)) continue;
    const current = await currentPhase(game.id);
    if (current?.id !== phase.id) continue;

    try {
      const result = await openNominations(client, game, phase);
      if (result.outcome === 'no-channel') {
        logger.warn({ message: `Nominations for game ${game.id} could not open: no channel to post in.` });
      }
    } catch (error) {
      logger.warn({ message: `Nominations for game ${game.id} could not open.`, error });
    }
  }
};

export const startNominationEngine = (client: Client): ReturnType<typeof setInterval> => {
  const run = () =>
    tickNominations(client).catch((error) => logger.error({ message: 'Nomination tick failed.', error }));
  void run();
  return setInterval(run, TICK_MS);
};
