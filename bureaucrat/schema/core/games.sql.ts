import { boolean, integer, jsonb, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { primary, snowflake, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Alignment, GameState, Phase, PlayerState, WhisperMode } from './enums.sql';
import { Queue } from './queues.sql';
import { fk } from '../helpers/foreign-key';

export const Game = core.table('Game', {
  id: primary.uuid(),
  queue: fk(Queue.id, { nullable: true, onDelete: 'set null' }),
  creator: snowflake().notNull(),
  name: text().notNull(),
  state: GameState().notNull().default('signups'),
  endedAt: timestamp(),
  ...snowflakes('guild', 'channel'),
  ...timestamps(),
});

export const GamePhase = core.table(
  'GamePhase',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    phase: Phase().notNull(),
    on: integer().notNull(),
    nominationsOpenedAt: timestamp(),
    nominationsClosedAt: timestamp(),
    ...timestamps(),
  },
  (table) => [unique().on(table.game, table.phase, table.on), unique().on(table.game, table.id)],
);

export const GameSettings = core.table('GameSettings', {
  id: primary.uuid(),
  game: fk(Game.id, { onDelete: 'cascade' }).unique(),
  plannedThreads: text().array().notNull().default([]),
  playerCount: integer(),
  /** Null means by the table: as many as the base counts give evil for the players seated. */
  whispersPerDay: integer(),
  whisperMode: WhisperMode().notNull().default('sync'),
  asyncWhispersPerDay: integer().notNull().default(0),
  groupWhispers: boolean().notNull().default(false),
  travelerWhispers: boolean().notNull().default(false),
  neighbourWhispers: boolean().notNull().default(false),
  preciseWhisperTracking: boolean().notNull().default(false),
  nominationThread: text().default('Nominations'),
  nominateStoryteller: boolean().notNull().default(false),
  nominationsAfter: integer(),
  scriptThread: text().default('Script & Seating'),
  seatingThread: text().default('Script & Seating'),
  whisperThread: text().default('Whispers'),
  exposeRoles: boolean().notNull().default(false),
  rolesLive: boolean().notNull().default(true),
  publishedSeating: jsonb().$type<PublishedSeat[]>(),
  publishedAt: timestamp(),
  liveSeatMap: jsonb().$type<Record<string, string | null>>(),
  ...timestamps(),
});

export type PublishedSeat = {
  id: string;
  player: string | null;
  member: string | null;
  seat: number;
  nickname: string | null;
  state: (typeof PlayerState.enumValues)[number];
  traveler: boolean;
  trueRole: string | null;
  trueAlignment: (typeof Alignment.enumValues)[number] | null;
  apparentRole: string | null;
  apparentAlignment: (typeof Alignment.enumValues)[number] | null;
};
