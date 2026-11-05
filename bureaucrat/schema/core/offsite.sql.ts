import { boolean, unique } from 'drizzle-orm/pg-core';
import { fk, primary, snowflake, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';

/**
 * An off-server archive: a category chain in another server (or this one)
 * that a server's games are copied into. `category` is the chain's current
 * head, moved along when it fills, as an on-server archive setting is.
 */
export const OffsiteDestination = core.table('OffsiteDestination', {
  id: primary.uuid(),
  ...snowflakes('guild', 'category'),
  destGuild: snowflake().notNull(),
  /** Set by `/archives offsite sync`: the offsite engine reflows this archive once its queue is empty. */
  reflowPending: boolean().notNull().default(false),
  ...timestamps(),
});

/**
 * One on-server archive family mapped to its destination. `category` is any
 * link of the family's chain (`games/archives/`), so the chain growing or
 * being renamed `… 1` does not lose it.
 */
export const OffsiteSource = core.table(
  'OffsiteSource',
  {
    id: primary.uuid(),
    ...snowflakes('guild', 'category'),
    destination: fk(OffsiteDestination.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => [unique().on(table.guild, table.category)],
);
