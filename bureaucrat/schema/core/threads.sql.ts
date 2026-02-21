import { foreignKey, text, unique } from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { ThreadType } from './enums.sql';
import { Game } from './games.sql';
import { Participant } from './people.sql';

/**
 * A ManagedThread is a thread for which Bureaucrat controls entry and exit conditions
 * for all users. Various kinds of threads have specific access control (such as KIBITZ)
 * and certain threads (such as ST threads and whispers) allow Kibitzers to programmatically
 * follow certain players around in the game.
 */
export const ManagedThread = core.table(
  'ManagedThread',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    kind: ThreadType().notNull(),
    tag: text(),
    ...snowflakes('thread'),
    ...timestamps(),
  },
  (table) => [unique().on(table.game, table.id), unique().on(table.thread)],
);

/**
 * A Participant in the Game can interact with a ManagedThread, and Bureaucrat
 * automatically adds and removes them from relevant threads as needed.
 */
export const ManagedThreadParticipant = core.table(
  'ManagedThreadParticipant',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    thread: fk(ManagedThread.id),
    participant: fk(Participant.id),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.thread, table.participant),
    foreignKey({
      columns: [table.game, table.thread],
      foreignColumns: [ManagedThread.game, ManagedThread.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.game, table.participant],
      foreignColumns: [Participant.game, Participant.id],
    }).onDelete('cascade'),
  ],
);

/**
 * A Follow is a relationship between a Kibitzer and Player that permits the former
 * to (automatically) enter all threads visible to the target Player. This is
 * useful for a Kibitzer that wants to track the whispers of a subset of Players,
 * for instance.
 */
export const Follow = core.table(
  'Follow',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    target: fk(Participant.id),
    follower: fk(Participant.id),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.target, table.follower),
    foreignKey({
      columns: [table.game, table.target],
      foreignColumns: [Participant.game, Participant.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.game, table.follower],
      foreignColumns: [Participant.game, Participant.id],
    }).onDelete('cascade'),
  ],
);
