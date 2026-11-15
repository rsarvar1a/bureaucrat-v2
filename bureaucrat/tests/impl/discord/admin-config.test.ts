import { test, expect } from 'bun:test';
import { buildCustomId } from '../../../engine/discord/views/custom-id';
import { MAX_TABS } from '../../../engine/discord/components/tabs';
import { ARCHETYPES, isArchetype } from '../../../impl/discord/views/admin/config/archetypes';
import { ACTIONS, TABS } from '../../../impl/discord/views/admin/config/tabs';

test('the strip fits on one row, with distinct keys', () => {
  expect(TABS.length).toBeLessThanOrEqual(MAX_TABS);
  expect(new Set(TABS.map((t) => t.key)).size).toBe(TABS.length);
});

test('every custom id stays under the 100-character cap', () => {
  const viewId = '0'.repeat(36);
  for (const action of [...ACTIONS, ...TABS.map((t) => `tab-${t.key}`), 'dismiss']) {
    expect(() => buildCustomId('view::adminconfig', action, viewId), action).not.toThrow();
  }
});

test('every archetype is listed once, with a description Discord accepts', () => {
  expect(ARCHETYPES.map((a) => a.key).sort()).toEqual(['manager', 'moderator', 'player', 'storyteller']);
  for (const a of ARCHETYPES) expect(a.about.length, a.key).toBeLessThanOrEqual(100);
});

test('only the four archetypes parse back from a select', () => {
  for (const a of ARCHETYPES) expect(isArchetype(a.key)).toBe(true);
  expect(isArchetype('admin')).toBe(false);
  expect(isArchetype(undefined)).toBe(false);
});
