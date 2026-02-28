import { foreignKey, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { abc } from './.schema.sql';

/**
 * Represents an active view in the Bureaucrat view framework.
 *
 * A view is an object that lives at a route and consists of:
 * - a routing path
 * - a state
 * - a renderer
 * - a set of interactions (mutations)
 */
export const View = abc.table(
  'View',
  {
    id: primary.uuid(),
    route: text().notNull(),
    state: jsonb(),
    entityId: text(),
    parent: uuid(),
    visibility: text().notNull().$type<'public' | 'ephemeral'>(),
    expiresAt: timestamp(),
    webhookToken: text(),
    ...snowflakes('channel', 'message'),
    ...snowflakes(true, 'member'),
    ...timestamps(),
  },
  (table) => [foreignKey({ columns: [table.parent], foreignColumns: [table.id] }).onDelete('cascade')],
);

/**
 * The dependency graph in which the effect of a view can
 * cause the mutation of a state that triggers the re-rendering
 * of other views is defined via context labels. Views can listen
 * to several contexts at any one time, leading to a rather
 * reactive and responsive UX.
 *
 * Context labels are bare strings (e.g., 'nomination::abc::votes').
 * Unreachable contexts are inert — no separate Context table needed.
 */
export const Subscription = abc.table(
  'Subscription',
  {
    id: primary.uuid(),
    view: fk(View.id, { onDelete: 'cascade' }),
    contextLabel: text().notNull(),
    action: text().notNull().$type<'render' | 'destroy'>().default('render'),
    ...timestamps(),
  },
  (table) => [unique().on(table.view, table.contextLabel)],
);
