import { test, expect, mock } from 'bun:test';

// `windows.ts` reaches the database through `query.ts`; the pure parts under
// test here never do, so the module is stubbed to keep the registry and
// `openWindow` while dropping the queries.
const opened: { route: string; parent?: string }[] = [];

mock.module('../../../engine/discord/views/query', () => ({
  listViews: async () => [],
  listDescendants: async () => [],
}));

const { openWindow, registerStack } = await import('../../../engine/discord/views/windows');
const { stack } = await import('../../../engine/discord/components/stack');

import type { ViewRow } from '../../../engine/discord/views/types';

type Header = { tab: 'messaging' | 'phases' };

const header = stack<Header>()({
  route: 'gconfig',
  field: 'tab',
  tabs: [
    { key: 'messaging', label: 'Messaging', window: 'gmessaging' },
    { key: 'phases', label: 'Phases', window: 'gphases' },
  ],
  fallback: 'messaging',
});

const fake = (state: Partial<Header> | null) =>
  ({ state, customId: (action: string) => `id::${action}` }) as unknown as ViewRow<Header>;

test('the active tab names the window beneath the header', () => {
  expect(header.window(fake({ tab: 'phases' }))).toBe('gphases');
  expect(header.window(fake({}))).toBe('gmessaging');
});

test('one handler per tab, same names as a plain strip', () => {
  expect(Object.keys(header.interactions).sort()).toEqual(['tab-messaging', 'tab-phases']);
});

type Root = { tab: 'setup' | 'phases'; 'tab:setup'?: 'script' | 'whispers' };

const root = stack<Root>()({
  route: 'groot',
  field: 'tab',
  tabs: [
    {
      key: 'setup',
      label: 'Configuration',
      window: 'gsetup',
      inline: {
        tabs: [
          { key: 'script', label: 'Script', window: 'gscript' },
          { key: 'whispers', label: 'Whispers', window: 'gwhispers' },
        ],
        fallback: 'script',
      },
    },
    { key: 'phases', label: 'Phases', window: 'gphases' },
  ],
  fallback: 'setup',
});

const fakeRoot = (state: Partial<Root> | null) =>
  ({ state, customId: (action: string) => `id::${action}` }) as unknown as ViewRow<Root>;

test('an inlined tab opens the leaf its strip has active, falling back like a strip does', () => {
  expect(root.window(fakeRoot({ tab: 'setup', 'tab:setup': 'whispers' }))).toBe('gwhispers');
  expect(root.window(fakeRoot({ tab: 'setup' }))).toBe('gscript');
  expect(root.window(fakeRoot({ tab: 'setup', 'tab:setup': 'gone' as never }))).toBe('gscript');
  expect(root.window(fakeRoot({ tab: 'phases' }))).toBe('gphases');
});

test('an inlined strip is a second row behind a separator and a subtitle, only while its tab is active', () => {
  const rows = root.rows(fakeRoot({ tab: 'setup' }));
  expect(rows).toHaveLength(4);
  expect((rows[2]!.toJSON() as { content?: string }).content).toBe('**Configuration**');
  expect(root.rows(fakeRoot({ tab: 'phases' }))).toHaveLength(1);
});

test('an inlined strip adds one handler per leaf, named after both tabs', () => {
  expect(Object.keys(root.interactions).sort()).toEqual([
    'tab-phases',
    'tab-setup',
    'tab-setup-script',
    'tab-setup-whispers',
  ]);
  expect(root.actions).toHaveLength(4);
});

test('opening a registered header opens its default child beneath it', async () => {
  // The stack registered itself at definition; a nested header does the same,
  // so a tree of headers opens to its leaves in one call.
  registerStack('gthreads', { window: () => 'gthreadplan' });

  const spawn = async (route: string, _target: unknown, options?: { parent?: string }) => {
    opened.push({ route, parent: options?.parent });
    return { id: `row:${route}`, route, state: {} } as unknown as ViewRow;
  };

  await openWindow(spawn, { interaction: {} as never }, 'gthreads');

  expect(opened.map((o) => o.route)).toEqual(['gthreads', 'gthreadplan']);
  expect(opened[1]!.parent).toBe('row:gthreads');
});

test('an unregistered route opens alone', async () => {
  opened.length = 0;

  const spawn = async (route: string) => {
    opened.push({ route });
    return { id: `row:${route}`, route, state: {} } as unknown as ViewRow;
  };

  await openWindow(spawn, { interaction: {} as never }, 'gphases');

  expect(opened.map((o) => o.route)).toEqual(['gphases']);
});
