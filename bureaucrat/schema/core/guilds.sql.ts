import { boolean, integer, unique } from 'drizzle-orm/pg-core';
import { primary, snowflake, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';

export const GuildSettings = core.table(
  'GuildSettings',
  {
    id: primary.uuid(),
    ...snowflakes('guild'),
    archive: snowflake(),
    /** Whether a game is copied into the archive server as soon as it ends. */
    offsiteAuto: boolean().notNull().default(false),
    /** Whether a game's private threads (whispers, the Storyteller's, kibitz) go into the copy. */
    offsitePrivate: boolean().notNull().default(false),
    /** Under this many games a win rate counts half this many extra wins and losses; 0 is off. */
    statsNormalization: integer().notNull().default(0),
    ...timestamps(),
  },
  (table) => [unique().on(table.guild)],
);
