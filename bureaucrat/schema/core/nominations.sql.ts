import { sql } from 'drizzle-orm';
import { boolean, foreignKey, integer, text, unique, uniqueIndex, timestamp } from 'drizzle-orm/pg-core';
import { primary, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Game, GamePhase } from './games.sql';
import { Seating } from './seating.sql';
import { NominationKind, PlayerState } from './enums.sql';
import { fk } from '../helpers/foreign-key';

export const Nomination = core.table(
  'Nomination',
  {
    id: primary.uuid(),
    game: fk(Game.id),
    phase: fk(GamePhase.id),
    kind: NominationKind().notNull(),
    plaintiff: fk(Seating.id),
    defendant: fk(Seating.id, { nullable: true }),
    required: integer().notNull(),
    block: boolean().notNull().default(false),
    finalizedAt: timestamp(),
    accusation: text(),
    defense: text(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('Nomination_phase_plaintiff_idx')
      .on(table.phase, table.plaintiff)
      .where(sql`"kind" <> 'exile'`),
    uniqueIndex('Nomination_phase_defendant_idx')
      .on(table.phase, table.defendant)
      .where(sql`"kind" <> 'exile'`),
    uniqueIndex('Nomination_phase_storyteller_idx')
      .on(table.phase)
      .where(sql`"kind" = 'storyteller'`),
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

export const Vote = core.table(
  'Vote',
  {
    id: primary.uuid(),
    game: fk(Game.id),
    nomination: fk(Nomination.id),
    player: fk(Seating.id),
    position: integer().notNull(),
    state: PlayerState().notNull(),
    locked: boolean().notNull().default(false),
    yes: boolean(),
    weight: integer(),
    spent: boolean().notNull().default(false),
    public: text(),
    private: text(),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.nomination, table.player),
    unique().on(table.nomination, table.position),
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
