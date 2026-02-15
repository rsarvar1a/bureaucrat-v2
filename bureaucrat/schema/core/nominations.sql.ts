import {
  boolean,
  foreignKey,
  integer,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import { primary, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Game, GamePhase } from './games.sql';
import { Seating } from './seating.sql';
import { PlayerState } from './enums.sql';
import { fk } from '../helpers/foreign-key';

/**
 * A Nomination is a collection of each point-in-time voting ballot created
 * for a particular nomination in a phase.
 */
export const Nomination = core.table(
  'Nomination',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    phase: fk(GamePhase.id, { onDelete: 'cascade' }),
    plaintiff: fk(Seating.id, { onDelete: 'cascade' }),
    defendant: fk(Seating.id, { onDelete: 'cascade' }),
    required: integer().notNull(),
    block: boolean().notNull().default(false),
    accusation: text(),
    defense: text(),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.phase, table.plaintiff),
    unique().on(table.phase, table.defendant),
    unique().on(table.game, table.id),
    foreignKey({
      columns: [table.game, table.phase],
      foreignColumns: [GamePhase.game, GamePhase.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.game, table.plaintiff],
      foreignColumns: [Seating.game, Seating.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.game, table.defendant],
      foreignColumns: [Seating.game, Seating.id],
    }).onDelete('cascade'),
  ],
);

/**
 * Each player that existed in the game in a particular state is given a Vote
 * that represents their point-in-time state at the time of the nomination;
 * the states in which the nomination is resolved include those effects that
 * occurred after the end of the nomination.
 *
 * For instance, a plaintiff that is Witch-cursed should be resolved dead
 * in the Seating before the nomination is actually created, which is a hard
 * problem when the creation of the nomination is automatic and the Storyteller's
 * ability to declare the state change is manual.
 */
export const Vote = core.table(
  'Vote',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    nomination: fk(Nomination.id, { onDelete: 'cascade' }),
    player: fk(Seating.id, { onDelete: 'cascade' }),
    state: PlayerState().notNull(),
    lock: integer(),
    public: text(),
    private: text(),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.nomination, table.player),
    foreignKey({
      columns: [table.game, table.nomination],
      foreignColumns: [Nomination.game, Nomination.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.game, table.player],
      foreignColumns: [Seating.game, Seating.id],
    }).onDelete('cascade'),
  ],
);
