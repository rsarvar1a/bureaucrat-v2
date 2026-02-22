import { jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { Game } from '../core/games.sql';
import { abc } from './.schema.sql';

/**
 * An InteractionSession tracks the accumulated state of an in-progress
 * multi-step ephemeral flow (e.g. the Nominate command palette). Sessions
 * are member-specific: the `member` column is the Discord snowflake of the
 * guild member who opened the palette; only they can advance or submit it.
 *
 * Sessions are not used for public view interactions — those are routed
 * entirely by customId and resolved by the channel→game index.
 */
export const InteractionSession = abc.table('InteractionSession', {
  id:        primary.uuid(),
  game:      fk(Game.id, { onDelete: 'cascade' }),
  flow:      text().notNull(),
  step:      text().notNull(),
  payload:   jsonb().notNull().default({}),
  expiresAt: timestamp().notNull(),
  ...snowflakes('member'),
  ...timestamps(),
});
