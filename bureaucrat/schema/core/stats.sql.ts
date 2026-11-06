import { integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { GameExport } from './exports.sql';
import { Game } from './games.sql';

/**
 * A game's human messages, counted once from its largest export. Scanning the
 * messages takes too long for a view, so `/stats messages` reads these, and
 * recounts a game whose largest export has moved on from `export` and
 * `exportMessages`. `played`, `firstAt` and `lastAt` cover its stretch of play.
 */
export const GameMessageStats = core.table(
  'GameMessageStats',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    export: fk(GameExport.id, { onDelete: 'cascade' }),
    exportMessages: integer().notNull(),
    messages: integer().notNull(),
    played: integer().notNull(),
    threads: integer().notNull(),
    authors: integer().notNull(),
    firstAt: timestamp(),
    lastAt: timestamp(),
    ...timestamps(),
  },
  (table) => [unique().on(table.game)],
);

export const GameMemberMessageStats = core.table(
  'GameMemberMessageStats',
  {
    id: primary.uuid(),
    stats: fk(GameMessageStats.id, { onDelete: 'cascade' }),
    ...snowflakes('member'),
    messages: integer().notNull(),
    played: integer().notNull(),
  },
  (table) => [unique().on(table.stats, table.member)],
);
