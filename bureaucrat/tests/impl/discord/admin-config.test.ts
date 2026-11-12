import { test, expect } from 'bun:test';
import { buildCustomId } from '../../../engine/discord/views/custom-id';
import { ACTIONS, ARCHETYPES, isArchetype } from '../../../impl/discord/views/admin/config/archetypes';

test('every custom id stays under the 100-character cap', () => {
  const viewId = '0'.repeat(36);
  for (const action of [...ACTIONS, 'dismiss']) {
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
