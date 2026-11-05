import { test, expect } from 'bun:test';
import { ComponentType } from 'discord.js';
import {
  chunk,
  componentsText,
  reactionsLine,
  renderMessage,
  replyLine,
  rewriteMentions,
  splitAttachments,
  webhookName,
  type RenderContext,
} from '../../../impl/discord/games/offsite/render';
import type { ExportMessageRow } from '../../../drizzle/game-exports';

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  members: new Map([
    ['1', { displayName: 'Alice', username: 'alice', avatar: 'https://cdn/alice.png', bot: false }],
    ['2', { displayName: 'Bob', username: 'bob', avatar: null, bot: false }],
  ]),
  channels: new Map([
    ['10', { name: 'whisper-a', copiedTo: 900n }],
    ['11', { name: 'whisper-b', copiedTo: null }],
  ]),
  roles: { '20': 'Player' },
  parentOf: () => null,
  guild: 500n,
  target: 600n,
  fileCap: 10 * 1_048_576,
  previous: new Date('2026-03-01T10:00:00Z'),
  ...over,
});

const row = (over: Partial<ExportMessageRow> = {}): ExportMessageRow => ({
  id: 'm',
  export: 'e',
  channel: 10n,
  message: 123n,
  author: 1n,
  bot: false,
  system: false,
  content: 'hello',
  createdAt: new Date('2026-03-01T12:00:00Z'),
  editedAt: null,
  pinned: false,
  replyTo: null,
  attachments: [],
  embeds: [],
  reactions: [],
  components: null,
  extras: {},
  copiedTo: null,
  readAt: null,
  ...over,
});

const at = Math.floor(new Date('2026-03-01T12:00:00Z').getTime() / 1000);

test('a webhook name is bounded and never the forbidden words', () => {
  expect(webhookName('  Alice ')).toBe('Alice');
  expect(webhookName('Discord Clyde')).toBe('d1scord c1yde');
  expect(webhookName('')).toBe('unknown');
  expect(webhookName('x'.repeat(100))).toHaveLength(80);
  // A name that shows nothing falls back: display name, then username, then id.
  expect(webhookName('\u17B5', 'alice', '123')).toBe('alice');
  expect(webhookName('\u200B\u3164 ', '\u2800', '123')).toBe('123');
  expect(webhookName(undefined, undefined)).toBe('unknown');
  // A visible name with joiners inside is kept whole.
  expect(webhookName('👩\u200D💻 Bea', 'bea')).toBe('👩\u200D💻 Bea');
});

test('mentions become names, a copied thread a live mention, the rest left alone', () => {
  expect(rewriteMentions('hi <@1> and <@!2>, see <#10> or <#11>, <@&20> <@&21> <@999>', ctx())).toBe(
    'hi @Alice and @Bob, see <#900> or #whisper-b, @Player <@&21> <@999>',
  );
});

test('a reply quotes its parent, linked once the parent is copied', () => {
  const c = ctx();
  expect(replyLine({ author: 2n, content: 'first line\nsecond', copiedTo: 777n }, c)).toBe(
    '-# ↪ [Bob](https://discord.com/channels/500/600/777): first line',
  );
  expect(replyLine({ author: 2n, content: '', copiedTo: null }, c)).toBe('-# ↪ **Bob**: *no text*');
  expect(replyLine(null, c)).toContain('not copied');
});

test('the reactions footer names who reacted and counts the rest', () => {
  const line = reactionsLine(
    [
      { emoji: '👍', count: 3, users: ['1', '2'] },
      { emoji: '<:evil:42>', count: 1, users: ['2'] },
      { emoji: '🎉', count: 2, users: [] },
    ],
    ctx(),
  );
  expect(line).toBe('-# 👍 3 (Alice, Bob, +1) · <:evil:42> 1 (Bob) · 🎉 2');
  expect(reactionsLine([], ctx())).toBeNull();
});

test('attachments over the cap become a note, and at most ten are files', () => {
  const small = { name: 'a.png', url: 'u', size: 10, contentType: 'image/png' };
  const big = { name: 'b.mp4', url: 'u', size: 20 * 1_048_576, contentType: 'video/mp4' };
  const { files, notes } = splitAttachments([small, big], 10 * 1_048_576);
  expect(files).toEqual([{ attachment: 'u', name: 'a.png' }]);
  expect(notes).toEqual(['-# 📎 b.mp4 (20.0 MB) was too large to copy']);
  expect(
    splitAttachments(
      Array.from({ length: 12 }, () => small),
      1000,
    ).files,
  ).toHaveLength(10);
});

test('a V2 container flattens to its text with rules for separators', () => {
  const tree = [
    {
      type: ComponentType.Container,
      components: [
        { type: ComponentType.TextDisplay, content: '### Seating' },
        { type: ComponentType.Separator },
        {
          type: ComponentType.Section,
          components: [{ type: ComponentType.TextDisplay, content: '1. Alice' }],
          accessory: {},
        },
        { type: ComponentType.ActionRow, components: [{ type: ComponentType.Button, label: 'Vote' }] },
      ],
    },
  ];
  expect(componentsText(tree)).toBe('### Seating\n───\n1. Alice');
  expect(componentsText(null)).toBe('');
});

test('long content is cut on line breaks and every chunk fits', () => {
  const text = Array.from({ length: 120 }, (_, i) => `line ${i} ${'x'.repeat(40)}`).join('\n');
  const chunks = chunk(text);
  expect(chunks.length).toBeGreaterThan(2);
  for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2000);
  expect(chunks.join('\n')).toBe(text);
  expect(chunk('a'.repeat(4500)).map((c) => c.length)).toEqual([2000, 2000, 500]);
});

test('a message renders with its time, content and footer, and a divider when the day changes', () => {
  const r = renderMessage(row({ reactions: [{ emoji: '👍', count: 1, users: ['2'] }], editedAt: new Date() }), ctx());
  expect(r.skip).toBe(false);
  expect(r.username).toBe('Alice');
  expect(r.avatarURL).toBe('https://cdn/alice.png');
  expect(r.chunks).toEqual([`-# <t:${at}:t> (edited)\nhello\n-# 👍 1 (Bob)`]);

  const first = renderMessage(row(), ctx({ previous: null }));
  expect(first.chunks[0]!.startsWith(`-# ── <t:${at}:D> ──\n-# <t:${at}:t>\nhello`)).toBe(true);
  const nextDay = renderMessage(row(), ctx({ previous: new Date('2026-02-28T23:00:00Z') }));
  expect(nextDay.chunks[0]).toContain('──');
});

test('a system message is skipped, a pin is kept, a poll and a sticker read as text', () => {
  expect(renderMessage(row({ system: true }), ctx()).skip).toBe(true);
  expect(renderMessage(row({ pinned: true }), ctx()).pin).toBe(true);
  const r = renderMessage(
    row({
      content: '',
      extras: {
        poll: { question: 'Who?', answers: [{ text: 'Alice', votes: 2 }] },
        stickers: [{ name: 'wave', url: 'https://cdn/wave.png' }],
      },
    }),
    ctx(),
  );
  expect(r.chunks[0]).toContain('📊 **Who?**\n- Alice · 2');
  expect(r.chunks[0]).toContain('[wave](https://cdn/wave.png)');
});

test('a card with no text and no files is skipped, one with text is copied as text', () => {
  const empty = renderMessage(
    row({ content: '', components: [{ type: ComponentType.ActionRow, components: [] }] }),
    ctx(),
  );
  expect(empty.skip).toBe(false);
  expect(empty.chunks[0]).toContain('-# <t:');
  const card = renderMessage(
    row({ content: '', components: [{ type: ComponentType.TextDisplay, content: 'Day 1 · <@1> nominates' }] }),
    ctx(),
  );
  expect(card.chunks[0]).toContain('Day 1 · @Alice nominates');
});
