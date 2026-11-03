import { boolean, index, integer, jsonb, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { fk, primary, snowflake, snowflakes, timestamps } from '../helpers';
import { core } from './.schema.sql';
import { ExportChannelKind, ExportState } from './enums.sql';
import { Game } from './games.sql';

export const GameExport = core.table(
  'GameExport',
  {
    id: primary.uuid(),
    game: fk(Game.id, { onDelete: 'cascade' }),
    state: ExportState().notNull().default('reading'),
    copy: boolean().notNull().default(false),
    ...snowflakes(true, 'guild', 'channel'),
    webhook: snowflake(),
    roles: jsonb().$type<Record<string, string>>().notNull().default({}),
    channels: integer().notNull().default(0),
    messages: integer().notNull().default(0),
    copied: integer().notNull().default(0),
    unread: jsonb().$type<string[]>().notNull().default([]),
    error: text(),
    startedAt: timestamp(),
    finishedAt: timestamp(),
    ...timestamps(),
  },
  (table) => [unique().on(table.game)],
);

export const ExportChannel = core.table(
  'ExportChannel',
  {
    id: primary.uuid(),
    export: fk(GameExport.id, { onDelete: 'cascade' }),
    ...snowflakes('channel'),
    kind: ExportChannelKind().notNull(),
    name: text().notNull(),
    parent: snowflake(),
    createdAt: timestamp().notNull(),
    archived: boolean().notNull().default(false),
    locked: boolean().notNull().default(false),
    readDone: boolean().notNull().default(false),
    copiedTo: snowflake(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [unique().on(table.export, table.channel)],
);

export type ExportAttachment = {
  name: string;
  url: string;
  size: number;
  contentType: string | null;
  width?: number | null;
  height?: number | null;
};

export type ExportReaction = { emoji: string; count: number; users: string[] };

export type ExportExtras = {
  poll?: { question: string; answers: { text: string; votes: number }[] };
  stickers?: { name: string; url: string }[];
  forwards?: { content: string; attachments: ExportAttachment[] }[];
};

export const ExportMessage = core.table(
  'ExportMessage',
  {
    id: primary.uuid(),
    export: fk(GameExport.id, { onDelete: 'cascade' }),
    ...snowflakes('channel', 'message'),
    author: snowflake().notNull(),
    bot: boolean().notNull().default(false),
    system: boolean().notNull().default(false),
    content: text().notNull().default(''),
    createdAt: timestamp().notNull(),
    editedAt: timestamp(),
    pinned: boolean().notNull().default(false),
    replyTo: snowflake(),
    attachments: jsonb().$type<ExportAttachment[]>().notNull().default([]),
    embeds: jsonb().$type<unknown[]>().notNull().default([]),
    reactions: jsonb().$type<ExportReaction[]>().notNull().default([]),
    components: jsonb().$type<unknown[] | null>(),
    extras: jsonb().$type<ExportExtras>().notNull().default({}),
    copiedTo: snowflake(),
  },
  (table) => [unique().on(table.export, table.message), index().on(table.export, table.channel, table.message)],
);

export const ExportMember = core.table(
  'ExportMember',
  {
    id: primary.uuid(),
    export: fk(GameExport.id, { onDelete: 'cascade' }),
    ...snowflakes('member'),
    displayName: text().notNull(),
    username: text().notNull(),
    avatar: text(),
    bot: boolean().notNull().default(false),
  },
  (table) => [unique().on(table.export, table.member)],
);
