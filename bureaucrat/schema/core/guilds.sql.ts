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
    /** A win rate over fewer games than this is padded up to it, half won and half lost; 0 is off. */
    statsNormalization: integer().notNull().default(0),
    /** The access archetypes (`impl/acl/archetypes.ts`), each a list of Discord roles. */
    managerRoles: snowflake().array().notNull().default([]),
    moderatorRoles: snowflake().array().notNull().default([]),
    /** When any is set, one is needed to enter a queue or sign up as a Storyteller. */
    storytellerRoles: snowflake().array().notNull().default([]),
    /** When any is set, one is needed to sign up as a Player or Kibitzer. */
    playerRoles: snowflake().array().notNull().default([]),
    ...timestamps(),
  },
  (table) => [unique().on(table.guild)],
);
