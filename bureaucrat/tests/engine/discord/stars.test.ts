import { test, expect } from 'bun:test';
import { NUDGES, nudge, starBar } from '../../../engine/discord/components/stars';

const MAX = 5;

test('a nudge from nothing starts in the middle, not at an end', () => {
  // Every value on the scale is then one press away from a fresh panel, and
  // `>` reads as "a bit above average" rather than "one star".
  expect(nudge(null, 1, MAX)).toBe(4);
  expect(nudge(null, -1, MAX)).toBe(2);
  expect(nudge(null, 3, MAX)).toBe(5);
  expect(nudge(null, -3, MAX)).toBe(1);
});

test('every nudge from nothing lands on the scale', () => {
  for (const delta of NUDGES) {
    const landed = nudge(null, delta, MAX);
    expect(landed).toBeGreaterThanOrEqual(1);
    expect(landed).toBeLessThanOrEqual(MAX);
  }
});

test('the big nudges move by three', () => {
  expect(nudge(4, -3, MAX)).toBe(1);
  expect(nudge(2, 3, MAX)).toBe(5);
});

test('nudges clamp at both ends rather than wrapping', () => {
  // Somebody leaning on `>>` should stop at five, not reappear at one having
  // said the opposite of what they meant.
  expect(nudge(5, 3, MAX)).toBe(MAX);
  expect(nudge(5, 1, MAX)).toBe(MAX);
  expect(nudge(1, -3, MAX)).toBe(1);
  expect(nudge(1, -1, MAX)).toBe(1);
});

test('a nudge that cannot move returns its input, which is what disables the button', () => {
  expect(nudge(5, 1, MAX)).toBe(5);
  expect(nudge(1, -1, MAX)).toBe(1);
  expect(nudge(4, 1, MAX)).not.toBe(4);
});

test('the bar fills from the left and always has five stars', () => {
  expect(starBar(3, MAX)).toBe('★★★☆☆');
  expect(starBar(5, MAX)).toBe('★★★★★');
  expect(starBar(1, MAX)).toBe('★☆☆☆☆');

  for (const value of [null, 0, 1, 2, 3, 4, 5]) {
    expect(starBar(value, MAX)).toHaveLength(MAX);
  }
});

test('no opinion reads as an empty bar, not as one star', () => {
  expect(starBar(null, MAX)).toBe('☆☆☆☆☆');
});

test('a value outside the scale cannot draw a ragged bar', () => {
  // Nothing should ever write one, but a row from a future version with a
  // wider scale must not render as six stars here.
  expect(starBar(9, MAX)).toBe('★★★★★');
  expect(starBar(-2, MAX)).toBe('☆☆☆☆☆');
});
