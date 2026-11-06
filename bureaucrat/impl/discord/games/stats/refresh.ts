import { listLargestExports, listStoredMessageStats, recountGameMessages } from '../../../../drizzle/stats';
import { withLock } from '../../../../utilities/lock';
import { staleExports } from './messages';

/**
 * Brings a guild's message counts up to date with its exports, and says how
 * many of its games are still being read. Holds the guild's lock so two viewers
 * do not count one game twice. The first run scans every message, so a caller
 * must already have deferred.
 */
export const refreshMessageStats = (guild: bigint): Promise<{ reading: number }> =>
  withLock(`stats:${guild}`, async () => {
    const [largest, stored] = await Promise.all([listLargestExports(guild), listStoredMessageStats(guild)]);
    for (const exp of staleExports(largest, stored)) {
      await recountGameMessages(exp.game, exp.id, exp.messages);
    }
    return { reading: largest.filter((exp) => exp.state === 'reading').length };
  });
