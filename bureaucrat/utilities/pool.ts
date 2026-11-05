type Env = { OFFSITE_CONCURRENCY?: string | undefined; DATABASE_POOL_SIZE?: string | undefined };

const positive = (value: string | undefined): number | null => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
};

/** How many offsite exports run at once: `OFFSITE_CONCURRENCY`, else 4. */
export const offsiteConcurrency = (env: Env = process.env): number => positive(env.OFFSITE_CONCURRENCY) ?? 4;

/**
 * Database connections: `DATABASE_POOL_SIZE` as given, else enough for the
 * offsite workers (two each, one mid-query and one for a clone's transaction
 * or a card's render) on top of ten for everything else, kept under the
 * hundred connections Postgres allows by default.
 */
export const poolSize = (env: Env = process.env): number =>
  positive(env.DATABASE_POOL_SIZE) ?? Math.min(80, 10 + 2 * offsiteConcurrency(env));
