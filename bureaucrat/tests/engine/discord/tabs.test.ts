import { test, expect } from 'bun:test';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { MAX_TABS, tabs } from '../../../engine/discord/components/tabs';
import type { ViewRow } from '../../../engine/discord/views/types';

type State = { tab: 'details' | 'signups'; other: number };

const strip = tabs<State>()({
  field: 'tab',
  tabs: [
    { key: 'details', label: 'Details' },
    { key: 'signups', label: 'Signups' },
  ],
  fallback: 'details',
});

/** A row as the strip sees it: state and a custom id that echoes its action. */
const fake = (state: Partial<State> | null) =>
  ({ state, customId: (action: string) => `id::${action}` }) as unknown as ViewRow<State>;

test('the active tab is the one held in state', () => {
  expect(strip.active(fake({ tab: 'signups' }))).toBe('signups');
});

test('a missing or unknown key falls back rather than rendering a bare strip', () => {
  // A pane spawned before the tab existed carries no key; one spawned before a
  // rename carries a stale one. Both should land somewhere with content.
  expect(strip.active(fake({}))).toBe('details');
  expect(strip.active(fake(null))).toBe('details');
  expect(strip.active(fake({ tab: 'gone' as State['tab'] }))).toBe('details');
});

test('the strip disables the active tab and leaves the rest pressable', () => {
  const row = strip.row(fake({ tab: 'signups' }));
  const [details, signups] = row.components as ButtonBuilder[];

  expect(details!.data.disabled).toBeFalsy();
  expect(signups!.data.disabled).toBe(true);
  expect((details!.data as { custom_id?: string }).custom_id).toBe('id::tab-details');
  expect(details!.data.style).toBe(ButtonStyle.Secondary);
});

test('trailing buttons join the strip on the same row', () => {
  const done = new ButtonBuilder().setCustomId('done').setLabel('Done').setStyle(ButtonStyle.Secondary);
  const row = strip.row(fake({ tab: 'details' }), done);

  expect(row.components).toHaveLength(3);
  expect(row.components[2]).toBe(done);
});

test('one handler per tab, named after its action', () => {
  expect(Object.keys(strip.interactions).sort()).toEqual(['tab-details', 'tab-signups']);
  expect(strip.actions.sort()).toEqual(['tab-details', 'tab-signups']);
});

test('a sixth tab is refused at definition time, not at render time', () => {
  const six = Array.from({ length: MAX_TABS + 1 }, (_, i) => ({ key: `t${i}`, label: `T${i}` }));

  expect(() => tabs<{ tab: string }>()({ field: 'tab', tabs: six, fallback: 't0' })).toThrow(/at most/);
});

test('the active tab is Primary; the rest wear the style they ask for, Secondary otherwise', () => {
  const withDanger = tabs<{ tab: string }>()({
    field: 'tab',
    tabs: [
      { key: 'details', label: 'Details' },
      { key: 'other', label: 'Other' },
      { key: 'delete', label: 'Delete', style: ButtonStyle.Danger },
    ],
    fallback: 'details',
  });
  const [details, other, del] = withDanger.row(fake({ tab: 'details' })).components as ButtonBuilder[];

  expect(details!.data.style).toBe(ButtonStyle.Primary);
  expect(other!.data.style).toBe(ButtonStyle.Secondary);
  expect(del!.data.style).toBe(ButtonStyle.Danger);
});
