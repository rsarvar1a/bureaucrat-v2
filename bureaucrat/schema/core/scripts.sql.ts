import { sql } from 'drizzle-orm';
import { bytea, check, integer, jsonb, text, unique } from 'drizzle-orm/pg-core';
import { fk, primary, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { Game } from './games.sql';
import { QueueEntry } from './queues.sql';

export const Script = core.table(
  'Script',
  {
    id: primary.uuid(),
    game: fk(Game.id, { nullable: true, onDelete: 'cascade' }).unique(),
    entry: fk(QueueEntry.id, { nullable: true, onDelete: 'cascade' }).unique(),
    name: text(),
    author: text(),
    link: text(),
    json: jsonb().$type<unknown>(),
    jsonName: text(),
    pdf: bytea(),
    pdfName: text(),
    nights: jsonb().$type<unknown>(),
    nightsName: text(),
    ...timestamps(),
  },
  (table) => [check('Script_one_owner', sql`(${table.game} IS NULL) <> (${table.entry} IS NULL)`)],
);

export const ScriptPage = core.table(
  'ScriptPage',
  {
    id: primary.uuid(),
    script: fk(Script.id, { onDelete: 'cascade' }),
    page: integer().notNull(),
    png: bytea().notNull(),
    ...timestamps(),
  },
  (table) => [unique().on(table.script, table.page)],
);
