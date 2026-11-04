import {
  ChannelType,
  GuildPremiumTier,
  PermissionFlagsBits,
  ThreadAutoArchiveDuration,
  type CategoryChannel,
  type Client,
  type Guild,
  type Message,
  type TextChannel,
  type Webhook,
} from 'discord.js';
import {
  countCopied,
  lastCopiedTimeOf,
  listChannels,
  listMembers,
  listUncopiedMessages,
  parentOf,
  setMessageCopy,
  updateChannel,
  updateExport,
  type ExportChannelRow,
  type ExportMessageRow,
  type GameExportRow,
} from '../../../../drizzle/game-exports';
import { listGameWinners } from '../../../../drizzle/game-winners';
import { getOrCreateGuildSettings, updateGuildSettings } from '../../../../drizzle/guild-settings';
import { listParticipants } from '../../../../drizzle/participants';
import { getScriptSummary } from '../../../../drizzle/scripts';
import { listSeating } from '../../../../drizzle/seating';
import type { Game } from '../../../../schema/core/games.sql';
import { logger } from '../../../../utilities/logger';
import { roleLook, townSquare } from '../../views/games/seating/render';
import { characterChoices } from '../../views/games/seating/roles';
import { ALIGNMENT_LABEL } from '../script/alignment';
import { endedChannelName } from '../names';
import { chainOf, roomIn } from '../archives/categories';
import { renderMessage, type RenderContext } from './render';
import { S } from '../../../../strings';

type GameRow = typeof Game.$inferSelect;

/** How the copy is going, for the card. */
export type CopyProgress = { copied: number; messages: number };
export type CopyReport = (progress: CopyProgress) => Promise<void>;

/** What the bot needs in the archive category; checked before a single message is sent. */
export const REQUIRED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

const MB = 1_048_576;

/** The upload cap the archive server's boost level buys. */
export const fileCapOf = (guild: Guild): number => {
  switch (guild.premiumTier) {
    case GuildPremiumTier.Tier3:
      return 100 * MB;
    case GuildPremiumTier.Tier2:
      return 50 * MB;
    default:
      return 10 * MB;
  }
};

export type Destination =
  | { ok: true; guild: Guild; category: CategoryChannel }
  | { ok: false; reason: 'noOffsite' | 'unreachable' | 'missing'; missing: string[] };

/** The archive server and category the settings name, and whether the bot can work there. */
export const destinationOf = async (client: Client, sourceGuild: bigint): Promise<Destination> => {
  const settings = await getOrCreateGuildSettings(sourceGuild);
  if (settings.offsiteGuild === null || settings.offsiteCategory === null) {
    return { ok: false, reason: 'noOffsite', missing: [] };
  }
  const guild = await client.guilds.fetch(String(settings.offsiteGuild)).catch(() => null);
  const category = guild ? await guild.channels.fetch(String(settings.offsiteCategory)).catch(() => null) : null;
  if (!guild || !category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, reason: 'unreachable', missing: [] };
  }
  const me = await guild.members.fetchMe();
  const missing = me.permissionsIn(category).missing(REQUIRED);
  if (missing.length > 0) return { ok: false, reason: 'missing', missing };
  return { ok: true, guild, category };
};

/** The game as the database knows it, posted first so the channel opens with its summary. */
const header = async (client: Client, game: GameRow, ctx: RenderContext): Promise<string> => {
  const [storytellers, script, seating, winners] = await Promise.all([
    listParticipants(game.id, 'Storyteller'),
    getScriptSummary(game.id),
    listSeating(game.id),
    listGameWinners(game.id),
  ]);
  const name = (member: bigint | null | undefined) =>
    member == null ? '*nobody*' : `**${ctx.members.get(String(member))?.displayName ?? member}**`;
  const look = roleLook(client, ctx.guild, characterChoices(script?.json));

  const lines = [`# ${game.name}`];
  if (game.endedAt) lines.push(`-# ended <t:${Math.floor(game.endedAt.getTime() / 1000)}:D>`);
  if (storytellers.length > 0) lines.push(`**Storytellers:** ${storytellers.map((st) => name(st.member)).join(', ')}`);
  if (script?.name || script?.link) {
    lines.push(`**Script:** ${script.link ? `[${script.name ?? 'script'}](${script.link})` : script.name}`);
  }
  if (game.winner) {
    const names = winners.map((w) => name(w.member)).join(', ');
    lines.push(`**${ALIGNMENT_LABEL[game.winner]} wins**${names ? `: ${names}` : ''}`);
  }
  if (seating.length > 0) lines.push('', townSquare(seating, look, name));
  return lines.join('\n');
};

/** The copied channel, made on the first run and found again on a resumed one. */
const channelOf = async (
  client: Client,
  game: GameRow,
  exp: GameExportRow,
  guild: Guild,
  category: CategoryChannel,
  ctx: RenderContext,
): Promise<TextChannel> => {
  if (exp.channel !== null) {
    const existing = await client.channels.fetch(String(exp.channel)).catch(() => null);
    if (existing && existing.type === ChannelType.GuildText) return existing;
  }
  // A full category rolls the chain over, and the setting follows it.
  const chain = await chainOf(guild, BigInt(category.id));
  const parent = chain
    ? (
        await roomIn(guild, chain, BigInt(category.id), async (next) => {
          await updateGuildSettings(game.guild, { offsiteCategory: BigInt(next.id) });
        })
      ).category
    : category;
  const channel = await guild.channels.create({
    name: endedChannelName(game.name, game.endedAt ?? new Date()),
    type: ChannelType.GuildText,
    parent,
    topic: `${game.name} · copied from the game server`.slice(0, 1024),
    reason: `Offsite archive of ${game.name}`,
  });
  await updateExport(exp.id, { guild: BigInt(guild.id), channel: BigInt(channel.id) });
  ctx.target = BigInt(channel.id);
  const summary = await header(client, game, ctx);
  await channel.send({ content: summary.slice(0, 2000), allowedMentions: { parse: [] } });
  return channel;
};

const webhookOf = async (client: Client, exp: GameExportRow, channel: TextChannel): Promise<Webhook> => {
  if (exp.webhook !== null) {
    const existing = await client.fetchWebhook(String(exp.webhook)).catch(() => null);
    if (existing) return existing;
  }
  const webhook = await channel.createWebhook({ name: 'Bureaucrat archive', reason: 'Offsite archive' });
  await updateExport(exp.id, { webhook: BigInt(webhook.id) });
  return webhook;
};

/** A source thread's copy: made under the channel on first sight, public whatever it was. */
const threadOf = async (channel: TextChannel, row: ExportChannelRow): Promise<bigint> => {
  if (row.copiedTo !== null) return row.copiedTo;
  const thread = await channel.threads.create({
    name: (row.kind === 'private' ? `🔒 ${row.name}` : row.name).slice(0, 100),
    type: ChannelType.PublicThread,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: 'Offsite archive',
  });
  await updateChannel(row.id, { copiedTo: BigInt(thread.id) });
  return BigInt(thread.id);
};

/** Sends one rendered message as its chunks; the last chunk carries the files and embeds and is the one recorded. */
const send = async (
  webhook: Webhook,
  threadId: string | undefined,
  row: ExportMessageRow,
  ctx: RenderContext,
): Promise<bigint> => {
  const rendered = renderMessage(row, ctx);
  if (rendered.skip) return 0n;

  let last: Message | null = null;
  for (const [i, content] of rendered.chunks.entries()) {
    const final = i === rendered.chunks.length - 1;
    const payload = {
      username: rendered.username,
      ...(rendered.avatarURL ? { avatarURL: rendered.avatarURL } : {}),
      content,
      allowedMentions: { parse: [] as never[] },
      ...(threadId ? { threadId } : {}),
      ...(final ? { files: rendered.files, embeds: rendered.embeds as never[] } : {}),
    };
    try {
      last = await webhook.send(payload);
    } catch (error) {
      if (!final) throw error;
      // A dead file or a bad embed: the words still go, with a note that something did not.
      logger.warn({ message: `Offsite copy: message ${row.message} sent without its files or embeds.`, error });
      last = await webhook.send({
        ...payload,
        files: [],
        embeds: [],
        content: `${content}\n-# *(an attachment or embed could not be copied)*`.slice(0, 2000),
      });
    }
  }
  if (last && rendered.pin) await last.pin().catch(() => undefined);
  return last ? BigInt(last.id) : 0n;
};

/**
 * Replays the export into the archive server: the channel with its header,
 * a webhook, a public thread per source thread, then every message not yet
 * copied, oldest first, each recorded as it lands so a restart carries on
 * at the first gap. Threads the source had archived are archived again.
 */
export const copyGame = async (
  client: Client,
  game: GameRow,
  exp: GameExportRow,
  report: CopyReport,
): Promise<void> => {
  const destination = await destinationOf(client, game.guild);
  if (!destination.ok) {
    throw new Error(
      destination.reason === 'noOffsite' ? S.errors.noOffsite : S.errors.offsiteNotReachable(destination.missing),
    );
  }
  const { guild, category } = destination;

  const members = new Map((await listMembers(exp.id)).map((m) => [String(m.member), m]));
  const channels = await listChannels(exp.id);
  const channelMap = new Map(channels.map((c) => [String(c.channel), c]));
  const parents = new Map<bigint, Awaited<ReturnType<typeof parentOf>>>();

  const ctx: RenderContext = {
    members,
    channels: channelMap,
    roles: exp.roles,
    parentOf: () => null,
    guild: BigInt(guild.id),
    target: exp.channel ?? 0n,
    fileCap: fileCapOf(guild),
    previous: null,
  };

  const channel = await channelOf(client, game, exp, guild, category, ctx);
  const webhook = await webhookOf(client, exp, channel);

  const progress: CopyProgress = { copied: await countCopied(exp.id), messages: exp.messages };
  await report(progress);

  // Threads first, so a mention of one can point at it from the start.
  for (const row of channels) {
    if (row.kind !== 'channel' && row.copiedTo === null) {
      row.copiedTo = await threadOf(channel, row);
      channelMap.set(String(row.channel), row);
    }
  }

  for (const row of channels) {
    const pending = await listUncopiedMessages(exp.id, row.channel);
    if (pending.length === 0) continue;

    ctx.target = row.kind === 'channel' ? BigInt(channel.id) : row.copiedTo!;
    ctx.previous = await lastCopiedTimeOf(exp.id, row.channel);
    const threadId = row.kind === 'channel' ? undefined : String(row.copiedTo!);

    for (const message of pending) {
      if (message.replyTo !== null && !parents.has(message.replyTo)) {
        parents.set(message.replyTo, await parentOf(exp.id, message.replyTo));
      }
      ctx.parentOf = (id) => parents.get(id) ?? null;

      const copied = await send(webhook, threadId, message, ctx);
      await setMessageCopy(message.id, copied);
      if (copied !== 0n) {
        const parent = parents.get(message.message);
        if (parent) parent.copiedTo = copied;
      }
      ctx.previous = message.createdAt;
      progress.copied += 1;
      await report(progress);
    }

    if (row.kind !== 'channel' && row.archived) {
      const thread = await client.channels.fetch(String(row.copiedTo)).catch(() => null);
      if (thread?.isThread()) await thread.setArchived(true, 'Archived in the source too').catch(() => undefined);
    }
  }

  await channel.setPosition(0).catch(() => undefined);
  await updateExport(exp.id, { state: 'copied', copied: progress.copied, finishedAt: new Date(), error: null });
};
