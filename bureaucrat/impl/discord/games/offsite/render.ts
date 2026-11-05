import { ComponentType } from 'discord.js';
import type { ExportChannelRow, ExportMemberRow, ExportMessageRow } from '../../../../drizzle/game-exports';
import type { ExportAttachment } from '../../../../schema/core/exports.sql';

/** What rendering needs to know beyond the message: who everyone is, where things went. */
export type RenderContext = {
  members: Map<string, Pick<ExportMemberRow, 'displayName' | 'username' | 'avatar' | 'bot'>>;
  channels: Map<string, Pick<ExportChannelRow, 'name' | 'copiedTo'>>;
  roles: Record<string, string>;
  /** The source message a reply points at, if stored: who wrote it, what it said, what it became. */
  parentOf: (message: bigint) => Pick<ExportMessageRow, 'author' | 'content' | 'copiedTo'> | null;
  /** The archive server and the copied channel, for jump links. */
  guild: bigint;
  /** The copied channel or thread this message goes into. */
  target: bigint;
  /** The archive server's upload cap in bytes. */
  fileCap: number;
  /** The previous copied message's time in this channel, for the day divider; null at the top. */
  previous: Date | null;
};

export type RenderedFile = { attachment: string; name: string };

/** One webhook payload per chunk; the identity is the same on each, the files and embeds on the last. */
export type Rendered = {
  username: string;
  avatarURL: string | null;
  chunks: string[];
  files: RenderedFile[];
  embeds: unknown[];
  pin: boolean;
  /** True when there is nothing to send: a system message the copy leaves out. */
  skip: boolean;
};

/** Discord's content cap for a webhook message. */
export const CHUNK = 2000;

const unix = (date: Date) => Math.floor(date.getTime() / 1000);

/**
 * Characters that take up no visible space: whitespace, format characters
 * (zero-width spaces and joiners), and the fillers people use for a blank
 * name (Hangul fillers, the braille blank, the Khmer inherent vowels). Discord
 * refuses a webhook name made only of these.
 */
// The Khmer vowels combine, so they sit outside the class.
const INVISIBLE = /[\s\p{Cf}\u115F\u1160\u2800\u3164\uFFA0]|\u17B4|\u17B5/gu;

const visible = (name: string): boolean => name.replace(INVISIBLE, '').length > 0;

/**
 * A webhook username: the first of the candidates (a display name, then a
 * username, then an id) that shows anything, 1 to 80 characters, never the
 * two words Discord refuses. The name itself is kept as it is, so an emoji
 * built with joiners survives.
 */
export const webhookName = (...candidates: (string | null | undefined)[]): string => {
  for (const candidate of candidates) {
    if (!candidate || !visible(candidate)) continue;
    const cleaned = candidate
      .replace(/discord/gi, 'd1scord')
      .replace(/clyde/gi, 'c1yde')
      .trim()
      .slice(0, 80);
    if (visible(cleaned)) return cleaned;
  }
  return 'unknown';
};

const firstLine = (text: string): string => text.split('\n').find((line) => line.trim()) ?? '';

const shorten = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Mentions become names: the archive server has none of these people, channels or roles. */
export const rewriteMentions = (content: string, ctx: RenderContext): string =>
  content
    .replace(/<@!?(\d+)>/g, (whole, id: string) => {
      const member = ctx.members.get(id);
      return member ? `@${member.displayName}` : whole;
    })
    .replace(/<#(\d+)>/g, (whole, id: string) => {
      const channel = ctx.channels.get(id);
      if (!channel) return whole;
      return channel.copiedTo ? `<#${channel.copiedTo}>` : `#${channel.name}`;
    })
    .replace(/<@&(\d+)>/g, (whole, id: string) => (ctx.roles[id] ? `@${ctx.roles[id]}` : whole));

/** The text of a Components V2 tree: every text display in order, a rule for each separator, nothing for controls. */
export const componentsText = (components: unknown[] | null | undefined): string => {
  const lines: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const c = node as { type?: number; content?: string; components?: unknown[]; accessory?: unknown };
    switch (c.type) {
      case ComponentType.TextDisplay:
        if (c.content) lines.push(c.content);
        return;
      case ComponentType.Separator:
        lines.push('───');
        return;
      case ComponentType.Section:
      case ComponentType.Container:
      case ComponentType.ActionRow:
        for (const child of c.components ?? []) walk(child);
        return;
      default:
        return;
    }
  };
  for (const node of components ?? []) walk(node);
  return lines.join('\n');
};

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

/** The files that fit, and a note for each that does not. */
export const splitAttachments = (
  attachments: ExportAttachment[],
  cap: number,
): { files: RenderedFile[]; notes: string[] } => {
  const files: RenderedFile[] = [];
  const notes: string[] = [];
  for (const a of attachments) {
    if (a.size <= cap && files.length < 10) files.push({ attachment: a.url, name: a.name });
    else notes.push(`-# 📎 ${a.name} (${megabytes(a.size)}) was too large to copy`);
  }
  return { files, notes };
};

const jump = (ctx: RenderContext, message: bigint) =>
  `https://discord.com/channels/${ctx.guild}/${ctx.target}/${message}`;

/** The reactions as one small line: emoji, count, and who. */
export const reactionsLine = (reactions: ExportMessageRow['reactions'], ctx: RenderContext): string | null => {
  if (reactions.length === 0) return null;
  const parts = reactions.map((r) => {
    const names = r.users.map((id) => ctx.members.get(id)?.displayName ?? id);
    const extra = r.count - names.length;
    const who = names.length > 0 ? ` (${names.join(', ')}${extra > 0 ? `, +${extra}` : ''})` : '';
    return `${r.emoji} ${r.count}${who}`;
  });
  return `-# ${parts.join(' · ')}`;
};

/** Content cut at the cap on line breaks where it can be, mid-line where it must. */
export const chunk = (text: string, cap = CHUNK): string[] => {
  if (text.length <= cap) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > cap) {
    let at = rest.lastIndexOf('\n', cap);
    if (at < cap / 2) at = rest.lastIndexOf(' ', cap);
    if (at < cap / 2) at = cap;
    out.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).replace(/^\s+/, '');
  }
  if (rest) out.push(rest);
  return out;
};

const isSameDay = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();

/**
 * A stored message as a webhook payload: the original time as a small first
 * line, mentions as names, the reply as a quote with a jump link, the bot's
 * cards as their text, polls and stickers and forwards as text, attachments
 * as files or a note, and the reactions as a footer.
 */
export const renderMessage = (row: ExportMessageRow, ctx: RenderContext): Rendered => {
  const author = ctx.members.get(String(row.author));
  const username = webhookName(author?.displayName, author?.username, String(row.author));
  const avatarURL = author?.avatar ?? null;
  const none: Rendered = { username, avatarURL, chunks: [], files: [], embeds: [], pin: false, skip: true };

  // Thread starts and pin notices are the copy's own business; nothing else of the system's is kept.
  if (row.system) return none;

  const head: string[] = [];
  if (ctx.previous === null || !isSameDay(ctx.previous, row.createdAt)) {
    head.push(`-# ── <t:${unix(row.createdAt)}:D> ──`);
  }
  head.push(`-# <t:${unix(row.createdAt)}:t>${row.editedAt ? ' (edited)' : ''}`);

  if (row.replyTo !== null) head.push(replyLine(ctx.parentOf(row.replyTo), ctx));

  const body: string[] = [];
  const content = rewriteMentions(row.content, ctx);
  if (content) body.push(content);
  if (row.components && row.components.length > 0) {
    const cards = componentsText(row.components);
    if (cards) body.push(rewriteMentions(cards, ctx));
  }
  for (const forward of row.extras.forwards ?? []) {
    const quoted = rewriteMentions(forward.content, ctx)
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    body.push(`-# ↱ forwarded\n${quoted || '> *no text*'}`);
  }
  if (row.extras.poll) {
    const { question, answers } = row.extras.poll;
    body.push([`📊 **${question}**`, ...answers.map((a) => `- ${a.text} · ${a.votes}`)].join('\n'));
  }
  for (const sticker of row.extras.stickers ?? []) body.push(`[${sticker.name}](${sticker.url})`);

  const forwarded = (row.extras.forwards ?? []).flatMap((f) => f.attachments);
  const { files, notes } = splitAttachments([...row.attachments, ...forwarded], ctx.fileCap);
  body.push(...notes);

  const footer = reactionsLine(row.reactions, ctx);
  const text = [...head, ...body, ...(footer ? [footer] : [])].join('\n');

  if (!text.trim() && files.length === 0 && row.embeds.length === 0) return none;

  const chunks = chunk(text || '-# *no text*');
  return { username, avatarURL, chunks, files, embeds: row.embeds, pin: row.pinned, skip: false };
};

/** `↪ name: first line…`, the name a jump link when the parent has been copied. */
export const replyLine = (
  parent: Pick<ExportMessageRow, 'author' | 'content' | 'copiedTo'> | null,
  ctx: RenderContext,
): string => {
  if (!parent) return '-# ↪ reply to a message that was not copied';
  const who = ctx.members.get(String(parent.author))?.displayName ?? String(parent.author);
  const name = parent.copiedTo ? `[${who}](${jump(ctx, parent.copiedTo)})` : `**${who}**`;
  return `-# ↪ ${name}: ${shorten(firstLine(rewriteMentions(parent.content, ctx)) || '*no text*', 80)}`;
};
