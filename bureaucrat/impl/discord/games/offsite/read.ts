import {
  ChannelType,
  EmbedType,
  MessageType,
  type Client,
  type Guild,
  type Message,
  type TextChannel,
  type ThreadChannel,
} from 'discord.js';
import { writable } from '../../../../engine/discord/views/threads';
import {
  countMessages,
  insertMessages,
  listChannels,
  oldestMessageOf,
  setReactions,
  updateChannel,
  updateExport,
  upsertChannels,
  upsertMembers,
  type ExportChannelRow,
  type GameExportRow,
} from '../../../../drizzle/game-exports';
import { listManagedThreads } from '../../../../drizzle/managed-threads';
import type { ExportAttachment, ExportMessage, ExportReaction } from '../../../../schema/core/exports.sql';
import type { Game } from '../../../../schema/core/games.sql';
import { logger } from '../../../../utilities/logger';
import { S } from '../../../../strings';

type GameRow = typeof Game.$inferSelect;
type MessageInsert = typeof ExportMessage.$inferInsert;

/** How the read is going, for the card: counts so far and the threads it could not open. */
export type ReadProgress = { channels: number; messages: number; unread: string[] };
export type Report = (progress: ReadProgress) => Promise<void>;

const PAGE = 100;
const USER_MENTION = /<@!?(\d+)>/g;
const ROLE_MENTION = /<@&(\d+)>/g;

const attachmentsOf = (message: Pick<Message, 'attachments'>): ExportAttachment[] =>
  message.attachments.map((a) => ({
    name: a.name,
    url: a.url,
    size: a.size,
    contentType: a.contentType,
    width: a.width,
    height: a.height,
  }));

/** The message as a row: everything the renderer may want, raw where the shape is Discord's. */
const rowOf = (exportId: string, channel: bigint, m: Message): MessageInsert => ({
  export: exportId,
  channel,
  message: BigInt(m.id),
  author: BigInt(m.author.id),
  bot: m.author.bot,
  system: m.system,
  content: m.content,
  createdAt: m.createdAt,
  editedAt: m.editedAt,
  pinned: m.pinned,
  replyTo: m.type === MessageType.Reply && m.reference?.messageId ? BigInt(m.reference.messageId) : null,
  attachments: attachmentsOf(m),
  // Link previews regenerate from the URL; only embeds somebody built are worth keeping.
  embeds: m.embeds.filter((e) => e.data.type === EmbedType.Rich).map((e) => e.toJSON()),
  components: m.components.length > 0 ? m.components.map((c) => c.toJSON()) : null,
  extras: {
    ...(m.poll
      ? {
          poll: {
            question: m.poll.question.text ?? '',
            answers: [...m.poll.answers.values()].map((a) => ({ text: a.text ?? '', votes: a.voteCount })),
          },
        }
      : {}),
    ...(m.stickers.size > 0 ? { stickers: m.stickers.map((s) => ({ name: s.name, url: s.url })) } : {}),
    ...(m.messageSnapshots.size > 0
      ? {
          forwards: m.messageSnapshots.map((s) => ({
            content: s.content ?? '',
            attachments: attachmentsOf(s),
          })),
        }
      : {}),
  },
});

/** Who reacted with what. One request per emoji per message, so only for messages that have any. */
const reactionsOf = async (m: Message): Promise<ExportReaction[]> => {
  const out: ExportReaction[] = [];
  for (const reaction of m.reactions.cache.values()) {
    const users = await reaction.users.fetch({ limit: 100 }).catch(() => null);
    out.push({
      emoji: reaction.emoji.id
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : (reaction.emoji.name ?? '❓'),
      count: reaction.count,
      users: users ? [...users.keys()] : [],
    });
  }
  return out;
};

/** Every thread under the channel: active, archived public, archived private, and the tracked ones by id. */
const threadsOf = async (client: Client, channel: TextChannel, game: GameRow): Promise<Map<string, ThreadChannel>> => {
  const found = new Map<string, ThreadChannel>();
  const take = (threads: Iterable<ThreadChannel>) => {
    for (const thread of threads) found.set(thread.id, thread);
  };

  try {
    take((await channel.threads.fetchActive()).threads.values());
  } catch (error) {
    logger.warn({ message: `Export of game ${game.id}: active threads could not be listed.`, error });
  }
  for (const type of ['public', 'private'] as const) {
    let before: ThreadChannel | undefined;
    for (;;) {
      const page = await channel.threads.fetchArchived({ type, before, limit: 100 }).catch((error: unknown) => {
        logger.warn({ message: `Export of game ${game.id}: archived ${type} threads could not be listed.`, error });
        return null;
      });
      if (!page) break;
      take(page.threads.values());
      before = page.threads.last();
      if (!page.hasMore || !before) break;
    }
  }
  // A private thread the bot was never in is not listed, but its row says it exists.
  for (const row of await listManagedThreads(game.id)) {
    if (found.has(String(row.thread))) continue;
    const thread = await client.channels.fetch(String(row.thread)).catch(() => null);
    if (thread?.isThread()) found.set(thread.id, thread);
  }
  return found;
};

/** Reads one channel's messages, newest first, from where an earlier read stopped. */
const readChannel = async (
  exp: GameExportRow,
  row: ExportChannelRow,
  channel: TextChannel | ThreadChannel,
  members: Set<string>,
  roles: Set<string>,
  tally: { messages: number },
  report: Report,
  progress: ReadProgress,
): Promise<void> => {
  let before = (await oldestMessageOf(exp.id, row.channel))?.toString();
  for (;;) {
    const page = await channel.messages.fetch({ limit: PAGE, ...(before ? { before } : {}) });
    const messages = [...page.values()];
    if (messages.length === 0) break;

    await insertMessages(messages.map((m) => rowOf(exp.id, row.channel, m)));
    for (const m of messages) {
      members.add(m.author.id);
      for (const match of m.content.matchAll(USER_MENTION)) members.add(match[1]!);
      for (const match of m.content.matchAll(ROLE_MENTION)) roles.add(match[1]!);
      if (m.reactions.cache.size > 0) {
        const reactions = await reactionsOf(m);
        for (const r of reactions) for (const id of r.users) members.add(id);
        await setReactions(exp.id, BigInt(m.id), reactions);
      }
    }

    tally.messages += messages.length;
    progress.messages = tally.messages;
    await report(progress);

    if (messages.length < PAGE) break;
    before = messages[messages.length - 1]!.id;
  }
  await updateChannel(row.id, { readDone: true });
};

/** Names and avatars for everyone seen, as they are now; a member who left is looked up as a user. */
const recordMembers = async (client: Client, guild: Guild, exportId: string, ids: Set<string>): Promise<void> => {
  const all = [...ids];
  const rows: Parameters<typeof upsertMembers>[0] = [];
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const fetched = await guild.members.fetch({ user: chunk }).catch(() => null);
    for (const id of chunk) {
      const member = fetched?.get(id);
      if (member) {
        rows.push({
          export: exportId,
          member: BigInt(id),
          displayName: member.displayName,
          username: member.user.username,
          avatar: member.displayAvatarURL({ extension: 'png', size: 256 }),
          bot: member.user.bot,
        });
        continue;
      }
      const user = await client.users.fetch(id).catch(() => null);
      rows.push({
        export: exportId,
        member: BigInt(id),
        displayName: user?.displayName ?? id,
        username: user?.username ?? id,
        avatar: user?.displayAvatarURL({ extension: 'png', size: 256 }) ?? null,
        bot: user?.bot ?? false,
      });
    }
  }
  await upsertMembers(rows);
};

/**
 * Reads the game's channel and every thread under it into the export,
 * resuming whatever an earlier run left unfinished. Private threads the bot
 * is not in are joined for the read (and archived again after, if they
 * were); one that cannot be opened is recorded by name and skipped. Ends
 * with the members and roles seen, and the state moved on.
 */
export const readGame = async (client: Client, game: GameRow, exp: GameExportRow, report: Report): Promise<void> => {
  const source = await client.channels.fetch(String(game.channel)).catch(() => null);
  if (!source || source.type !== ChannelType.GuildText) throw new Error(S.errors.offsiteSourceGone);
  const guild = source.guild;

  const threads = await threadsOf(client, source, game);
  await upsertChannels([
    {
      export: exp.id,
      channel: BigInt(source.id),
      kind: 'channel',
      name: source.name,
      parent: null,
      createdAt: source.createdAt,
      archived: false,
      locked: false,
    },
    ...[...threads.values()].map((t) => ({
      export: exp.id,
      channel: BigInt(t.id),
      kind: (t.type === ChannelType.PrivateThread ? 'private' : 'public') as 'private' | 'public',
      name: t.name,
      parent: BigInt(source.id),
      createdAt: t.createdAt ?? new Date(0),
      archived: t.archived ?? false,
      locked: t.locked ?? false,
    })),
  ]);

  const rows = await listChannels(exp.id);
  const members = new Set<string>();
  const roles = new Set<string>();
  const unread = [...exp.unread];
  const tally = { messages: await countMessages(exp.id) };
  const progress: ReadProgress = { channels: rows.length, messages: tally.messages, unread };
  await report(progress);

  for (const row of rows) {
    if (row.readDone) continue;
    const channel = row.kind === 'channel' ? source : threads.get(String(row.channel));
    if (!channel) {
      unread.push(row.name);
      await updateChannel(row.id, { readDone: true });
      continue;
    }

    const wasArchived = channel.isThread() && channel.archived === true;
    try {
      if (channel.isThread()) await writable(channel);
      await readChannel(exp, row, channel, members, roles, tally, report, progress);
    } catch (error) {
      logger.warn({ message: `Export of game ${game.id}: ${row.name} could not be read.`, error });
      unread.push(row.name);
      await updateChannel(row.id, { readDone: true });
    } finally {
      if (wasArchived && channel.isThread() && !channel.archived) {
        await channel.setArchived(true, 'Read for the archive').catch(() => undefined);
      }
    }
  }

  await recordMembers(client, guild, exp.id, members);
  const roleNames = Object.fromEntries([...roles].map((id) => [id, guild.roles.cache.get(id)?.name ?? 'role']));

  await updateExport(exp.id, {
    state: exp.copy ? 'copying' : 'read',
    channels: rows.length,
    messages: tally.messages,
    unread: [...new Set(unread)],
    roles: { ...exp.roles, ...roleNames },
    ...(exp.copy ? {} : { finishedAt: new Date() }),
  });
};
