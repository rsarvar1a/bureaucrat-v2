import { integer, text, unique } from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Alignment, Role } from './enums.sql';
import { Game } from './games.sql';
import { Participant } from './people.sql';

export const GameWinner = core.table(
  'GameWinner',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    participant: fk(Participant.id, { nullable: true, onDelete: 'set null' }),
    ...snowflakes('member'),
    role: text(),
    alignment: Alignment(),
    ...timestamps(),
  },
  (table) => [unique().on(table.game, table.member)],
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
