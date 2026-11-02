import { test, expect } from 'bun:test';
import { bump, label, nudges, shown, step, stored, type Stepper } from '../../../engine/discord/components/stepper';

const counted: Stepper = { slug: 'chan', label: 'Channels per team', min: 1, max: 10 };
const capped: Stepper = { slug: 'mem', label: 'Members per team', min: 1, max: 50, unlimited: true };

const MB = 1024 * 1024;
const megabytes: Stepper = {
  slug: 'thumb',
  label: 'Max thumbnail',
  min: 1,
  max: 25,
  suffix: ' MB',
  toDisplay: (bytes) => Math.round(bytes / MB),
  fromDisplay: (mb) => mb * MB,
};

test('a press moves by one in each direction', () => {
  expect(step(counted, 4, 1)).toBe(5);
  expect(step(counted, 4, -1)).toBe(3);
});

test('both ends clamp rather than wrap', () => {
  // Holding `+` should stop at the maximum, not reappear at the minimum having
  // quietly changed the cap to something nobody asked for.
  expect(step(counted, 10, 1)).toBe(10);
  expect(step(counted, 1, -1)).toBe(1);
});

test('unlimited sits below the minimum, and only where allowed', () => {
  expect(step(capped, 1, -1)).toBeNull();
  expect(step(counted, 1, -1)).toBe(1);
});

test('stepping up from unlimited lands on the minimum', () => {
  expect(step(capped, null, 1)).toBe(capped.min);
});

test('stepping down from unlimited stays there', () => {
  // There is nothing below it, and a press that silently did nothing else
  // would be indistinguishable from a dropped interaction.
  expect(step(capped, null, -1)).toBeNull();
});

test('a stored unit round-trips through the displayed one', () => {
  expect(shown(megabytes, 4 * MB)).toBe(4);
  expect(stored(megabytes, 4)).toBe(4 * MB);
  expect(stored(megabytes, shown(megabytes, 4 * MB))).toBe(4 * MB);
});

test('conversion applies to the bounds too', () => {
  // The clamp is in display units, so 25 MB is the ceiling - not 25 bytes.
  expect(step(megabytes, 25, 1)).toBe(25);
  expect(stored(megabytes, step(megabytes, 24, 1))).toBe(25 * MB);
});

test('null passes through both conversions untouched', () => {
  expect(shown(megabytes, null)).toBeNull();
  expect(stored(megabytes, null)).toBeNull();
});

test('a custom step size is honoured', () => {
  const coarse: Stepper = { ...counted, step: 5, max: 100 };

  expect(step(coarse, 10, 1)).toBe(15);
  expect(step(coarse, 3, -1)).toBe(1);
});

test('labels read the value, and unlimited reads as ∞', () => {
  expect(label(counted, 4)).toBe('Channels per team · 4');
  expect(label(capped, null)).toBe('Members per team · ∞');
  expect(label(megabytes, 4)).toBe('Max thumbnail · 4 MB');
});

const wide: Stepper = { slug: 'wide', label: 'Concurrent games', min: 1, max: 25, bigStep: 5, unlimited: true };

test('a stepper offers two presses, or four with a big step', () => {
  expect(nudges(counted)).toEqual(['down', 'up']);
  expect(nudges(wide)).toEqual(['downBig', 'down', 'up', 'upBig']);
});

test('a big press moves by the big step and clamps at the top', () => {
  expect(bump(wide, 10, 'upBig')).toBe(15);
  expect(bump(wide, 23, 'upBig')).toBe(25);
  expect(bump(wide, 10, 'up')).toBe(11);
});

test('a big press down lands on the minimum before it lifts the cap', () => {
  // `<<` from 3 should not skip straight past the floor into unlimited.
  expect(bump(wide, 3, 'downBig')).toBe(1);
  expect(bump(wide, 1, 'downBig')).toBeNull();
  expect(bump(wide, 1, 'down')).toBeNull();
});

test('from unlimited, every upward press lands on the minimum', () => {
  expect(bump(wide, null, 'up')).toBe(1);
  expect(bump(wide, null, 'upBig')).toBe(1);
  expect(bump(wide, null, 'downBig')).toBeNull();
});

test('unlimited reads as the spec prefers', () => {
  expect(label({ ...capped, unlimitedLabel: 'not set' }, null)).toBe('Members per team · not set');
  expect(label(capped, null)).toBe('Members per team · ∞');
});
