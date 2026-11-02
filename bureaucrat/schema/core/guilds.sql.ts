import { unique } from 'drizzle-orm/pg-core';
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
    ...timestamps(),
  },
  (table) => [unique().on(table.guild)],
);
