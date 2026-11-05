type Env = {
  OFFSITE_CONCURRENCY?: string | undefined;
  OFFSITE_READERS?: string | undefined;
  OFFSITE_WRITERS?: string | undefined;
  DATABASE_POOL_SIZE?: string | undefined;
};

const positive = (value: string | undefined): number | null => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
};

/**
 * Offsite copies that write at once: `OFFSITE_WRITERS`, else the older
 * `OFFSITE_CONCURRENCY`, else 4. A writer sends through its own webhook,
 * outside the bot's request budget, and hands its slot back while Discord's
 * thread limit is shut, so this can run high.
 */
export const offsiteWriters = (env: Env = process.env): number =>
  positive(env.OFFSITE_WRITERS) ?? positive(env.OFFSITE_CONCURRENCY) ?? 4;

/**
 * Offsite exports that read at once: `OFFSITE_READERS`, else 4. Reading is
 * the bot's own requests (pages, reactions, private threads) under its one
 * budget of about fifty a second, and the CPU of parsing them, so a few
 * readers fill it and more only queue.
 */
export const offsiteReaders = (env: Env = process.env): number => positive(env.OFFSITE_READERS) ?? 4;

/**
 * Database connections: `DATABASE_POOL_SIZE` as given, else two for each
 * offsite worker (one mid-query, one for a clone's transaction or a card's
 * render) on top of ten for everything else, kept under the hundred
 * connections Postgres allows by default.
 */
export const poolSize = (env: Env = process.env): number =>
  positive(env.DATABASE_POOL_SIZE) ?? Math.min(80, 10 + 2 * (offsiteReaders(env) + offsiteWriters(env)));
