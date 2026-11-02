import { foreignKey, text, unique } from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { ThreadType } from './enums.sql';
import { Game } from './games.sql';
import { Participant } from './people.sql';

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
