import { test, expect } from 'bun:test';
import { buildCustomId } from '../../../engine/discord/views/custom-id';
import { MAX_TABS } from '../../../engine/discord/components/tabs';
import { ACTIONS, CONFIG_TABS, SETUP_TABS, SIGNUPS_TABS } from '../../../impl/discord/views/games/tabs';

const strips = { gconfig: CONFIG_TABS, gsetup: SETUP_TABS, gsignups: SIGNUPS_TABS };

test('every strip fits the tab budget and names distinct windows', () => {
  for (const tabs of Object.values(strips)) {
    expect(tabs.length).toBeLessThanOrEqual(MAX_TABS);
    expect(new Set(tabs.map((t) => t.key)).size).toBe(tabs.length);
    expect(new Set(tabs.map((t) => t.window)).size).toBe(tabs.length);
  }
});

test('every action custom id stays under the cap', () => {
  const viewId = '0'.repeat(36);
  for (const [route, tabs] of Object.entries(strips)) {
    for (const tab of tabs) {
      expect(() => buildCustomId(`view::${route}`, `tab-${tab.key}`, viewId)).not.toThrow();
      for (const leaf of 'inline' in tab && tab.inline ? tab.inline.tabs : []) {
        expect(() => buildCustomId(`view::${route}`, `tab-${tab.key}-${leaf.key}`, viewId)).not.toThrow();
      }
    }
  }
  for (const [route, actions] of Object.entries(ACTIONS)) {
    for (const action of actions) expect(() => buildCustomId(`view::${route}`, action, viewId)).not.toThrow();
  }
});
