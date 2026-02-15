import { boolean, integer, text, unique } from 'drizzle-orm/pg-core';
import { primary, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { PlayerState } from './enums.sql';
import { fk } from '../helpers/foreign-key';
import { Game, Participant } from './games.sql';

/**
 * A Seating entry in a game is effectively all of the bird's eye information
 * you would see for a given token in a real Clocktower grimoire, and includes:
 * - the player's seat number
 * - whether the player is dead or alive
 * - whether the player still has their ghost vote
 * - the player's true role
 * - the player's apparent role, if they are (for instance) a you-think role
 * - the player's claimed role, which can be anything
 * - any other details in the player's claim
 *
 * Each GamePlayer can obviously only appear once in the seating. Additionally,
 * each seat number can only appear once in each game's seating, and application
 * logic should enforce that sequences of seat number are unbroken runs from 1 to n.
 *
 * The Seating table also inherently implements claims, as all claims info is
 * one-to-one with a particular seat.
 */
export const Seating = core.table(
  'Seating',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    player: fk(Participant.id, { onDelete: 'cascade' }).unique(),
    seat: integer().notNull(),
    state: PlayerState().notNull().default('alive'),
    traveler: boolean().notNull().default(false),
    claim: text(),
    apparentRole: text(),
    claimedRole: text(),
    trueRole: text(),
    ...timestamps(),
  },
  (table) => [unique().on(table.game, table.seat)],
);
