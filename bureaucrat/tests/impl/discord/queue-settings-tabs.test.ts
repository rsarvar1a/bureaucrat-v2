import { test, expect } from 'bun:test';
import { buildCustomId } from '../../../engine/discord/views/custom-id';
import { MAX_TABS } from '../../../engine/discord/components/tabs';
import { nudges } from '../../../engine/discord/components/stepper';
import { ACTIONS, TABS } from '../../../impl/discord/views/queue/settings/tabs';
import { BUMP_ACTIONS, RESOURCES, parseBump } from '../../../impl/discord/views/queue/settings/resources';

test('the strip fits on one row', () => {
  expect(TABS.length).toBeLessThanOrEqual(MAX_TABS);
});

test('tab keys and labels are distinct', () => {
  expect(new Set(TABS.map((t) => t.key)).size).toBe(TABS.length);
  expect(new Set(TABS.map((t) => t.label)).size).toBe(TABS.length);
});

test('every custom id stays under the 100-character cap', () => {
  const viewId = '0'.repeat(36);

  for (const action of [...ACTIONS, ...TABS.map((t) => `tab-${t.key}`), 'dismiss']) {
    expect(() => buildCustomId('view::queuemanage', action, viewId), action).not.toThrow();
  }
});

test('the resources tab stays inside five rows', () => {
  // The strip, one row per cap, and the Dismiss row.
  expect(1 + RESOURCES.length + 1).toBeLessThanOrEqual(5);
});

test('every press on every cap has an action, and parses back to it', () => {
  expect(BUMP_ACTIONS.length).toBe(RESOURCES.reduce((n, spec) => n + nudges(spec).length, 0));

  for (const action of BUMP_ACTIONS) {
    const press = parseBump(action);
    expect(press, action).not.toBeNull();
    expect(`bump:${press!.spec.slug}:${press!.nudge}`).toBe(action);
  }
});

test('a readout or a stranger is not a press', () => {
  expect(parseBump('bump:conc:value')).toBeNull();
  expect(parseBump('bump:nope:up')).toBeNull();
  expect(parseBump('edit')).toBeNull();
});
