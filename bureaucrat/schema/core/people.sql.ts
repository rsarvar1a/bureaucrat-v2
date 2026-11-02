import { ExtraConfigColumn, text, unique, type PgColumnBaseConfig } from 'drizzle-orm/pg-core';
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

export const Participant = core.table('Participant', participantTableDefinition(), participantConstraint());

export const Signup = core.table(
  'Signup',
  {
    ...participantTableDefinition(),
    message: text(),
  },
  participantConstraint(),
);
