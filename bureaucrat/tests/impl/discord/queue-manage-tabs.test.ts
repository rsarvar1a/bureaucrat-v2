import { test, expect } from 'bun:test';
import { buildCustomId } from '../../../engine/discord/views/custom-id';
import { MAX_TABS } from '../../../engine/discord/components/tabs';
import { ACTIONS, TABS } from '../../../impl/discord/views/queue/manage/tabs';

test('the strip fits on one row', () => {
  expect(TABS.length).toBeLessThanOrEqual(MAX_TABS);
});

test('tab keys and labels are distinct', () => {
  expect(new Set(TABS.map((t) => t.key)).size).toBe(TABS.length);
  expect(new Set(TABS.map((t) => t.label)).size).toBe(TABS.length);
});

test('every custom id stays under the 100-character cap', () => {
  // `buildCustomId` throws past 100, and the throw would land at render time in
  // front of a Storyteller rather than here.
  const viewId = '0'.repeat(36);

  for (const action of [...ACTIONS, ...TABS.map((t) => `tab-${t.key}`), 'dismiss']) {
    expect(() => buildCustomId('view::qmanage', action, viewId), action).not.toThrow();
  }
});
