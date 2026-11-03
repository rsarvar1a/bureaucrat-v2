import { unique } from 'drizzle-orm/pg-core';
import { fk, primary, snowflake, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Role } from './enums.sql';
import { Game } from './games.sql';

export const GameRole = core.table(
  'GameRole',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    role: Role().notNull(),
    discordRole: snowflake().notNull(),
    ...timestamps(),
  },
  (table) => [unique().on(table.game, table.role)],
);
