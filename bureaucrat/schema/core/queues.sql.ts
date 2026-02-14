import { boolean, integer, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import {
  automaticTimestamp,
  primary,
  snowflake,
  snowflakes,
  timestamps,
} from '../helpers';
import { core } from '.';
import { Role } from './roles.sql';

/**
 * A Queue is a list of Storyteller intents to run games:
 *   - of a particular type, delineated by the queue name
 *   - in a particular category on the server that owns the queue
 *
 * A given category supported by a queue can have some number of games running
 * at the same time as decided by a maintainer; this is the `concurrency` of
 * the queue if applicable.
 *
 * When a game ends, its corresponding queue is alerted, and if the number of
 * active games on that queue is lower than the concurrency, the Storyteller
 * at the top is given the opportunity to claim the next slot or to pass it on.
 *
 * Each storyteller can have some number of signups in any given queue at a
 * time, controlled by `entriesPerStoryteller` if applicable.
 */
export const Queue = core.table('Queue', {
  id: primary.uuid(),
  name: text().notNull(),
  concurrency: integer(),
  entriesPerStoryteller: integer(),
  ...snowflakes('guild', 'category'),
  ...timestamps(),
});

/**
 * A QueueEntry is the record of a Storyteller that joins a queue, and contains:
 *  - the associated queue
 *  - a title and description for the entry
 *  - the earliest the game can run, if applicable
 *
 * If the entry gets to the top of the queue before the Storyteller is ready,
 * it will be skipped. However, it will remain at the top of the queue so that
 * once the minimum start date is reached, it will be selected.
 *
 * A Storyteller can decide whether to openly allow signups or whether to
 * operate on an invite-only basis (Storyteller signups are always invite-only).
 */
export const QueueEntry = core.table('QueueEntry', {
  id: primary.uuid(),
  queue: uuid()
    .notNull()
    .references(() => Queue.id, { onDelete: 'cascade' }),
  storyteller: snowflake().notNull(),
  title: text().notNull(),
  description: text().notNull(),
  minimumStartDate: automaticTimestamp().notNull(),
  public: boolean().notNull().default(true),
  ...timestamps(),
});

/**
 * A QueueEntrySignup represents an intent from a member of the server to play
 * in the entry's game once it is at the top of the queue. A member can pre-in
 * for some number of games (determined by configuration and not inherent to
 * this table), but only one Role per entry.
 *
 * If the QueueEntrySignup is attached to an entry with `public: false` or is
 * a request to co-Storytell, then the `accepted` field determines whether or
 * not the pre-in will be converted into a signup when the game is created.
 *
 * The public representation of a QueueEntry only contains those signups that
 * are (automatically or manually) accepted; only the creator of the entry can
 * see pending signup requests.
 */
export const QueueEntrySignup = core.table(
  'QueueEntrySignup',
  {
    ...snowflakes('member'),
    queueEntryId: uuid()
      .notNull()
      .references(() => QueueEntry.id, {
        onDelete: 'cascade',
      }),
    role: Role().notNull(),
    message: text(),
    accepted: boolean().notNull().default(false),
    ...timestamps(),
  },
  (table) => [primaryKey({ columns: [table.member, table.queueEntryId] })],
);
