import { boolean, foreignKey, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { fk, primary, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { WhisperState } from './enums.sql';
import { Game } from './games.sql';
import { Participant } from './people.sql';
import { ManagedThread } from './threads.sql';

export const Whisper = core.table('Whisper', {
  id: primary.uuid(),
  game: fk(Game.id, { onDelete: 'cascade' }),
  initiator: fk(Participant.id, { onDelete: 'cascade' }),
  day: integer().notNull(),
  async: boolean().notNull().default(false),
  free: boolean().notNull().default(false),
  state: WhisperState().notNull().default('pending'),
  promoting: boolean().notNull().default(false),
  thread: fk(ManagedThread.id, { nullable: true, onDelete: 'set null' }),
  ...timestamps(),
});

export const WhisperParticipant = core.table(
  'WhisperParticipant',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    whisper: fk(Whisper.id, { onDelete: 'cascade' }),
    participant: fk(Participant.id),
    accepted: boolean(),
    cost: integer().notNull().default(0),
    endedAt: timestamp(),
    promote: boolean(),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.whisper, table.participant),
    foreignKey({
      columns: [table.game, table.participant],
      foreignColumns: [Participant.game, Participant.id],
    }).onDelete('cascade'),
  ],
);
