import { boolean, foreignKey, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core';
import { fk, primary, snowflakes, timestamps } from '../helpers';
import { abc } from './.schema.sql';

export const View = abc.table(
  'View',
  {
    id: primary.uuid(),
    route: text().notNull(),
    state: jsonb(),
    entityId: text(),
    ids: jsonb().$type<Record<string, string>>(),
    parent: uuid(),
    visibility: text().notNull().$type<'public' | 'ephemeral'>(),
    autoExpires: boolean().notNull().default(false),
    webhookToken: text(),
    ...snowflakes('channel', 'message'),
    ...snowflakes(true, 'member'),
    ...timestamps(),
  },
  (table) => [foreignKey({ columns: [table.parent], foreignColumns: [table.id] }).onDelete('cascade')],
);

export const Subscription = abc.table(
  'Subscription',
  {
    id: primary.uuid(),
    view: fk(View.id, { onDelete: 'cascade' }),
    contextLabel: text().notNull(),
    action: text().notNull().$type<'render' | 'detach' | 'destroy'>().default('render'),
    ...timestamps(),
  },
  (table) => [unique().on(table.view, table.contextLabel)],
);
