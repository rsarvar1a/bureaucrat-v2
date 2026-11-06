import { integer, text, unique } from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Alignment, Role } from './enums.sql';
import { Game } from './games.sql';
import { Participant } from './people.sql';

/**
 * One result of a game: which team won. A game has one, or one per colour when
 * it is multicolour: a pair of games run as one in the same channel.
 */
export const GameOutcome = core.table(
  'GameOutcome',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(1),
    winner: Alignment().notNull(),
    ...timestamps(),
  },
  (table) => [unique().on(table.game, table.position)],
);

export const GameWinner = core.table(
  'GameWinner',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    outcome: fk(GameOutcome.id, { onDelete: 'cascade' }),
    participant: fk(Participant.id, { nullable: true, onDelete: 'set null' }),
    ...snowflakes('member'),
    role: text(),
    alignment: Alignment(),
    ...timestamps(),
  },
  (table) => [unique().on(table.outcome, table.member)],
);

export const GameRating = core.table(
  'GameRating',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    ...snowflakes('member'),
    role: Role().notNull(),

    script: integer().notNull(),
    scriptNote: text(),

    decisions: integer().notNull(),
    decisionsNote: text(),

    atmosphere: integer().notNull(),
    atmosphereNote: text(),

    overall: integer().notNull(),

    comment: text(),
    ...timestamps(),
  },
  (table) => [unique().on(table.game, table.member)],
);
