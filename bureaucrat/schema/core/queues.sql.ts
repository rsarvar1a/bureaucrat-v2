import { boolean, integer, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { primary, snowflake, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Role, SignupMode } from './enums.sql';
import { fk } from '../helpers/foreign-key';

export const Queue = core.table('Queue', {
  id: primary.uuid(),
  name: text().notNull(),
  description: text(),
  concurrency: integer(),
  entriesPerStoryteller: integer(),
  ...snowflakes('guild'),
  category: snowflake(),
  archive: snowflake(),
  entryPreviews: boolean().notNull().default(false),
  ...timestamps(),
});

export const QueueEntry = core.table('QueueEntry', {
  id: primary.uuid(),
  queue: fk(Queue.id, { onDelete: 'cascade' }),
  storyteller: snowflake().notNull(),
  title: text().notNull(),
  description: text().notNull(),
  minimumStartDate: timestamp(),
  signups: SignupMode().notNull().default('applications'),
  position: integer().notNull().default(0),
  ...timestamps(),
});

export const QueueEntrySignup = core.table(
  'QueueEntrySignup',
  {
    id: primary.uuid(),
    ...snowflakes('member'),
    entry: fk(QueueEntry.id, { onDelete: 'cascade' }),
    role: Role().notNull(),
    message: text(),
    accepted: boolean(),
    ...timestamps(),
  },
  (table) => [unique().on(table.member, table.entry)],
);
