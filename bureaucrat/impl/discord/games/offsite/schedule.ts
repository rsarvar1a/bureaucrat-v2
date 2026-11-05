/**
 * Which unfinished exports to start, given what is running. Reading and
 * writing draw on different limits (the bot's own request budget, and a
 * webhook per copy beside Discord's thread window), so each has its own
 * slots and neither can starve the other. Pure, so it is tested alone.
 */
export type Phase = 'reading' | 'copying';

export type Claimable = { id: string; game: string; state: Phase; notBefore: Date | null };

export type Running = { phase: Phase; game: string };

export const schedule = <T extends Claimable>(
  claimable: T[],
  running: Map<string, Running>,
  slots: Record<Phase, number>,
  now: Date,
): T[] => {
  const used: Record<Phase, number> = { reading: 0, copying: 0 };
  const busy = new Set<string>();
  for (const job of running.values()) {
    used[job.phase] += 1;
    // One job per game: a second export of it waits, so it can clone the first's read.
    busy.add(job.game);
  }

  const picks: T[] = [];
  for (const exp of claimable) {
    if (running.has(exp.id) || busy.has(exp.game)) continue;
    if (exp.notBefore !== null && exp.notBefore > now) continue;
    if (used[exp.state] >= slots[exp.state]) continue;
    used[exp.state] += 1;
    busy.add(exp.game);
    picks.push(exp);
  }
  return picks;
};
