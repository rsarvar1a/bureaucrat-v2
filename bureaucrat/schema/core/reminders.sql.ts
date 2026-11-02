import { boolean, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { fk, primary, snowflake, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Role } from './enums.sql';
import { Game } from './games.sql';

export const Reminder = core.table('Reminder', {
  id: primary.uuid(),
  game: fk(Game.id, { onDelete: 'cascade' }),
  author: snowflake().notNull(),
  channel: snowflake().notNull(),
  message: text().notNull(),
  fireAt: timestamp().notNull(),
  offsets: integer().array().notNull().default([]),
  posted: integer().array().notNull().default([]),
  mentions: Role().array().notNull().default([]),
  cancelled: boolean().notNull().default(false),
  ...timestamps(),
});
