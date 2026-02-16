import { integer, unique } from 'drizzle-orm/pg-core';
import { primary, snowflake, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { GameState, Phase, Role } from './enums.sql';
import { Queue } from './queues.sql';
import { fk } from '../helpers/foreign-key';

/**
 * A Game is the central reference for all parts of its constituent state.
 *
 * If a Game was created from a Queue, it aids in tracking the concurrency
 * of that queue by backreferencing to it.
 *
 * Games are in one of three states:
 * - signups: collecting signups, advertising
 * - running: after initializing seating and starting the game
 * - completed: after the Storyteller explicitly declares a winning team
 */
export const Game = core.table('Game', {
  id: primary.uuid(),
  queue: fk(Queue.id, { nullable: true, onDelete: 'set null' }),
  creator: snowflake().notNull(),
  state: GameState().notNull().default('signups'),
  ...snowflakes('guild', 'channel'),
  ...timestamps(),
});

/**
 * A Participant describes the capacity in which a server member is
 * participating in a given Game. They can be one of:
 * - Storyteller (of which the creator is a member by default)
 * - Player (an actual player seated in the town square)
 * - Kibitzer (someone who is just spectating and wants to follow along)
 */
export const Participant = core.table(
  'Participant',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    role: Role().notNull(),
    ...snowflakes('member'),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.game, table.member),
    unique().on(table.game, table.id),
  ],
);

/**
 * A GamePhase represents a day or night in a running Game. The
 * phase can be connected to another type of state, particularly:
 * - day phases are connected to nominations
 * - night phases are connected to night actions
 *
 * We can fairly easily determine the current day by taking the
 * phase on a given Game with the ordering (on, phase) desc.
 */
export const GamePhase = core.table(
  'GamePhase',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    phase: Phase().notNull(),
    on: integer().notNull(),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.game, table.phase, table.on),
    unique().on(table.game, table.id),
  ],
);
