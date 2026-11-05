import { index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primary, snowflakes } from '../helpers';
import { core } from './.schema.sql';

/**
 * One error the bot caught, kept for querying back: what kind, where, how
 * often, against what. `outcome` says what it cost: the job `failed`, the
 * result is `degraded` (something left out of it), or nothing was lost and
 * it was `ignored`. No foreign keys: the history outlives the game or export
 * it was about.
 */
export const ErrorEvent = core.table(
  'ErrorEvent',
  {
    id: primary.uuid(),
    at: timestamp().notNull().defaultNow(),
    area: text().notNull(),
    operation: text().notNull(),
    outcome: text().$type<'failed' | 'degraded' | 'ignored'>().notNull(),
    kind: text().notNull(),
    code: text(),
    status: integer(),
    route: text(),
    message: text().notNull(),
    game: uuid(),
    export: uuid(),
    ...snowflakes(true, 'guild', 'channel'),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index().on(table.at), index().on(table.area, table.operation, table.at)],
);
