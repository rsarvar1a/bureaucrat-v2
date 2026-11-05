import {
  ChannelType,
  GuildPremiumTier,
  MessageType,
  PermissionFlagsBits,
  SnowflakeUtil,
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
  countMessagesOfKinds,
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
import { getOrCreateGuildSettings } from '../../../../drizzle/guild-settings';
import { getDestination, updateDestination, type OffsiteDestinationRow } from '../../../../drizzle/offsite';
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

/** The archive server and category a destination names, and whether the bot can work there. */
export const destinationOf = async (
  client: Client,
  row: OffsiteDestinationRow | null | undefined,
): Promise<Destination> => {
  if (!row) return { ok: false, reason: 'noOffsite', missing: [] };
  const guild = await client.guilds.fetch(String(row.destGuild)).catch(() => null);
  const category = guild ? await guild.channels.fetch(String(row.category)).catch(() => null) : null;
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

/** The copied channel, made on the first run and found again on a resumed one; `created` says which. */
const channelOf = async (
  client: Client,
  game: GameRow,
  exp: GameExportRow,
  guild: Guild,
  category: CategoryChannel,
  ctx: RenderContext,
): Promise<{ channel: TextChannel; created: boolean }> => {
  if (exp.channel !== null) {
    const existing = await client.channels.fetch(String(exp.channel)).catch(() => null);
    if (existing && existing.type === ChannelType.GuildText) return { channel: existing, created: false };
  }
  // A full category rolls the chain over, and the destination follows it.
  const chain = await chainOf(guild, BigInt(category.id));
  const parent = chain
    ? (
        await roomIn(guild, chain, BigInt(category.id), async (next) => {
          if (exp.destination) await updateDestination(exp.destination, { category: BigInt(next.id) });
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
  return { channel, created: true };
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

/** When a thread began: its id says so, whatever Discord recorded besides. */
const bornAt = (row: ExportChannelRow): number => SnowflakeUtil.timestampFrom(String(row.channel));

/**
 * A source thread's copy, public whatever it was, since a private thread is
 * shown only to its members and a reader cannot be one of every thread.
 * Discord posts a "started a thread" line in the channel; `inSequence` keeps
 * it, as the link beside the messages the thread grew from, and otherwise it
 * is deleted rather than left out of place at the foot of the game.
 */
const threadOf = async (channel: TextChannel, row: ExportChannelRow, inSequence: boolean): Promise<bigint> => {
  if (row.copiedTo !== null) return row.copiedTo;
  const thread = await channel.threads.create({
    name: (row.kind === 'private' ? `🔒 ${row.name}` : row.name).slice(0, 100),
    type: ChannelType.PublicThread,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: 'Offsite archive',
  });
  await updateChannel(row.id, { copiedTo: BigInt(thread.id) });
  if (inSequence) return BigInt(thread.id);
  const recent = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const notice = recent?.find((m) => m.type === MessageType.ThreadCreated && m.reference?.channelId === thread.id);
  if (notice) await notice.delete().catch(() => undefined);
  return BigInt(thread.id);
};

/** Archives a thread's copy, if it is not already: none should sit in the thread bar. */
const archiveCopy = async (client: Client, row: ExportChannelRow): Promise<void> => {
  if (row.copiedTo === null) return;
  const thread = await client.channels.fetch(String(row.copiedTo)).catch(() => null);
  if (thread?.isThread() && !thread.archived) {
    await thread.setArchived(true, 'Offsite archive').catch(() => undefined);
  }
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
 * a webhook, then every message not yet copied, oldest first, each recorded
 * as it lands so a restart carries on at the first gap. A public thread per
 * source thread opens among the channel's messages when it began, and is
 * filled once the channel is done. Every thread's copy is archived at the end, whatever it
 * was in the source: an archive has nothing live.
 *
 * Private threads (whispers, the Storyteller's, kibitz) go only where the
 * server has said so (`offsitePrivate`); left out, nothing of theirs is
 * marked copied, so a server that turns them on later can send a finished
 * copy back through here for just those.
 */
export const copyGame = async (
  client: Client,
  game: GameRow,
  exp: GameExportRow,
  report: CopyReport,
): Promise<void> => {
  const destination = await destinationOf(client, exp.destination ? await getDestination(exp.destination) : null);
  if (!destination.ok) {
    throw new Error(
      destination.reason === 'noOffsite' ? S.errors.noOffsite : S.errors.offsiteNotReachable(destination.missing),
    );
  }
  const { guild, category } = destination;

  const settings = await getOrCreateGuildSettings(game.guild);
  const kinds: ExportChannelRow['kind'][] = settings.offsitePrivate
    ? ['channel', 'public', 'private']
    : ['channel', 'public'];

  const members = new Map((await listMembers(exp.id)).map((m) => [String(m.member), m]));
  // Every channel is known to the renderer, so a mention of a thread left out still has its name.
  const all = await listChannels(exp.id);
  const channels = all.filter((c) => kinds.includes(c.kind));
  const channelMap = new Map(all.map((c) => [String(c.channel), c]));
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

  const { channel, created } = await channelOf(client, game, exp, guild, category, ctx);
  const webhook = await webhookOf(client, exp, channel);

  const progress: CopyProgress = {
    copied: await countCopied(exp.id),
    messages: await countMessagesOfKinds(exp.id, kinds),
  };
  await report(progress);

  // Each thread opens in the channel where it began, its "started a thread"
  // line between the messages either side of that moment, so a whisper agreed
  // on in the channel sits beside the thread it became. One that began before
  // what is already copied (a later pass for private threads, a resumed run)
  // cannot go back, and opens without its line.
  const main = channels.find((row) => row.kind === 'channel');
  const threads = channels.filter((row) => row.kind !== 'channel');
  const unborn = threads.filter((row) => row.copiedTo === null).sort((a, b) => bornAt(a) - bornAt(b));
  let mainLast = main ? await lastCopiedTimeOf(exp.id, main.channel) : null;
  const openBefore = async (time: number) => {
    while (unborn.length > 0 && bornAt(unborn[0]!) < time) {
      const row = unborn.shift()!;
      const inSequence = mainLast === null || bornAt(row) >= mainLast.getTime();
      row.copiedTo = await threadOf(channel, row, inSequence);
      channelMap.set(String(row.channel), row);
    }
  };

  const copyRow = async (row: ExportChannelRow) => {
    const pending = await listUncopiedMessages(exp.id, row.channel);
    if (pending.length === 0) return;

    const isMain = row.kind === 'channel';
    ctx.target = isMain ? BigInt(channel.id) : row.copiedTo!;
    ctx.previous = await lastCopiedTimeOf(exp.id, row.channel);
    const threadId = isMain ? undefined : String(row.copiedTo!);

    for (const message of pending) {
      if (isMain) await openBefore(message.createdAt.getTime());
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
      if (isMain) mainLast = message.createdAt;
      progress.copied += 1;
      await report(progress);
    }
  };

  // The channel first, opening threads as it goes; then any begun after its
  // last message; then what the threads hold, every one of them open by now
  // so a mention of one in another can point at it.
  if (main) await copyRow(main);
  await openBefore(Infinity);
  for (const row of threads) await copyRow(row);

  // Sending to an archived thread opens it again, so every copy is closed once all are written.
  for (const row of channels) {
    if (row.kind !== 'channel') await archiveCopy(client, row);
  }

  // A new channel goes to the top; one revisited for its private threads stays where the reflow put it.
  if (created) await channel.setPosition(0).catch(() => undefined);
  await updateExport(exp.id, { state: 'copied', copied: progress.copied, finishedAt: new Date(), error: null });
};
