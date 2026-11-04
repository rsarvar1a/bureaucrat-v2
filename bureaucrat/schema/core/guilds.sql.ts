import { boolean, unique } from 'drizzle-orm/pg-core';
import { primary, snowflake, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';

export const GuildSettings = core.table(
  'GuildSettings',
  {
    id: primary.uuid(),
    ...snowflakes('guild'),
    archive: snowflake(),
    offsiteGuild: snowflake(),
    offsiteCategory: snowflake(),
    /** Whether a game is copied into the archive server as soon as it ends. */
    offsiteAuto: boolean().notNull().default(false),
    /** Set by `/archives offsite sync`: the offsite engine reflows the archive server once its queue is empty. */
    offsiteReflowPending: boolean().notNull().default(false),
    ...timestamps(),
  },
  (table) => [unique().on(table.guild)],
);
