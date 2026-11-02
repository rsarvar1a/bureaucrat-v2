import { boolean, foreignKey, integer, text, unique } from 'drizzle-orm/pg-core';
import { primary, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Alignment, PlayerState } from './enums.sql';
import { fk } from '../helpers/foreign-key';
import { Game } from './games.sql';
import { Participant } from './people.sql';

export const Seating = core.table(
  'Seating',
  {
    id: primary.uuid(),
    game: fk(Game.id),

    player: fk(Participant.id, { nullable: true }).unique(),
    seat: integer().notNull(),
    nickname: text(),
    state: PlayerState().notNull().default('alive'),
    traveler: boolean().notNull().default(false),
    claim: text(),
    apparentRole: text(),
    apparentAlignment: Alignment(),
    claimedRole: text(),
    trueRole: text(),
    trueAlignment: Alignment(),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.game, table.seat),
    unique().on(table.game, table.id),
    foreignKey({
      columns: [table.game, table.player],
      foreignColumns: [Participant.game, Participant.id],
    }).onDelete('cascade'),
  ],
);
