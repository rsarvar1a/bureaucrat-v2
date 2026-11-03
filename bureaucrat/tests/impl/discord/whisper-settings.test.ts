import { test, expect } from 'bun:test';
import { buildCustomId } from '../../../engine/discord/views/custom-id';
import {
  activeIn,
  asyncCap,
  MODES,
  nextMode,
  ROWS,
  SETTINGS,
  settingBySlug,
  toggleBySlug,
  TOGGLE_ROW,
  TOGGLES,
  withCap,
} from '../../../impl/discord/views/games/whispers/settings';

test('the whispers window fits inside five action rows, and its toggles in one', () => {
  expect(ROWS).toBeLessThanOrEqual(5);
  expect(TOGGLE_ROW).toBeLessThanOrEqual(5);
});

test('slugs are distinct across steppers and toggles, and round-trip', () => {
  const slugs = [...SETTINGS.map((s) => s.slug), ...TOGGLES.map((t) => t.slug)];
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const spec of SETTINGS) expect(settingBySlug(spec.slug)).toBe(spec);
  for (const toggle of TOGGLES) expect(toggleBySlug(toggle.slug)).toBe(toggle);
  expect(settingBySlug('nope')).toBeNull();
  expect(toggleBySlug('nope')).toBeNull();
});

test('the mode cycle visits every mode and comes back', () => {
  const seen = new Set<string>();
  let mode = MODES[0]!;
  for (let i = 0; i < MODES.length; i++) {
    seen.add(mode);
    mode = nextMode(mode);
  }
  expect(seen.size).toBe(MODES.length);
  expect(mode).toBe(MODES[0]!);
});

test('hybrid enables every stepper; sync and async enable one each', () => {
  expect(SETTINGS.every((spec) => activeIn(spec, 'hybrid'))).toBe(true);
  expect(SETTINGS.filter((spec) => activeIn(spec, 'sync')).length).toBe(1);
  expect(SETTINGS.filter((spec) => activeIn(spec, 'async')).length).toBe(1);
});

test('async whispers are capped at the main count', () => {
  const async = SETTINGS.find((s) => s.column === 'asyncWhispersPerDay')!;
  const main = SETTINGS.find((s) => s.column === 'whispersPerDay')!;
  expect(withCap(async, 3).max).toBe(3);
  expect(withCap(async, 99).max).toBe(async.max);
  expect(withCap(main, 3).max).toBe(main.max);
  expect(asyncCap(0)).toBe(0);
});

test('every custom id stays under the cap', () => {
  const viewId = '0'.repeat(36);
  for (const spec of SETTINGS) {
    for (const direction of ['upBig', 'up', 'down', 'downBig', 'value']) {
      expect(() => buildCustomId('view::gwhispers', `bump:${spec.slug}:${direction}`, viewId)).not.toThrow();
    }
  }
  for (const toggle of TOGGLES) {
    expect(() => buildCustomId('view::gwhispers', `toggle:${toggle.slug}`, viewId)).not.toThrow();
  }
  expect(() => buildCustomId('view::gwhispers', 'mode', viewId)).not.toThrow();
});
