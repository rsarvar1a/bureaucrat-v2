import {
  boolean,
  ExtraConfigColumn,
  unique,
  type PgColumnBaseConfig,
} from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Role } from './enums.sql';
import { Game } from './games.sql';
import type { ColumnType } from 'drizzle-orm';

const participantTableDefinition = () => ({
  id: primary.uuid(),
  game: fk(Game.id, { onDelete: 'cascade' }),
  role: Role().notNull(),
  ...snowflakes('member'),
  ...timestamps(),
});

type _TableConfig = ReturnType<typeof participantTableDefinition>;
type _ConstraintType = {
  [K in keyof _TableConfig]: ExtraConfigColumn<PgColumnBaseConfig<ColumnType>>;
};

const participantConstraint = () => (table: _ConstraintType) => [
  unique().on(table.game, table.member),
  unique().on(table.game, table.id),
];

/**
 * A Participant describes the capacity in which a server member is
 * participating in a given Game. They can be one of:
 * - Storyteller (of which the creator is a member by default)
 * - Player (an actual player seated in the town square)
 * - Kibitzer (someone who is just spectating and wants to follow along)
 */
export const Participant = core.table(
  'Participant',
  participantTableDefinition(),
  participantConstraint(),
);

/**
 * A Signup describes the capacity in which a server member intends to
 * participate in a given Game. They can be one of:
 * - Storyteller (of which the creator is a member by default)
 * - Player (an actual player seated in the town square)
 * - Kibitzer (someone who is just spectating and wants to follow along)
 *
 * Signups are controlled by the game configuration; if enabled, they allow
 * users to express interest in participating in a game. Storytellers can
 * then take signups and leverage more automatic processes to convert them
 * to Participants.
 *
 * If signups are disabled for a game, no member can signup as any role;
 * instead, they must be directly added as Participants in their
 * corresponding roles by a Storyteller.
 *
 * If a signup is not transmuted using /game signups take but instead
 * manually marked accepted, then at game creation time all such signups
 * not already transmuted into Participants will be automatically
 * converted.
 */
export const Signup = core.table(
  'Signup',
  {
    ...participantTableDefinition(),
    accepted: boolean().notNull().default(false),
  },
  participantConstraint(),
);
