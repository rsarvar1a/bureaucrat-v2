import { test, expect } from 'bun:test';
import { formatDuration, parseDuration, parseOffsets } from '../../../impl/discord/games/duration';

test('a duration string is seconds', () => {
  expect(parseDuration('1d13h4m2s')).toBe(86_400 + 13 * 3_600 + 4 * 60 + 2);
  expect(parseDuration('4h')).toBe(14_400);
  expect(parseDuration(' 2h 30m ')).toBe(9_000);
  expect(parseDuration('90s')).toBe(90);
});

test('anything that is not a duration, or is nothing, is refused', () => {
  for (const raw of ['', '0s', 'soon', '4h4h', '1m2h', '3', '1.5h']) expect(parseDuration(raw), raw).toBeNull();
});

test('offsets are distinct, longest first, and shorter than the duration', () => {
  expect(parseOffsets('4h 2h 1h')).toEqual([14_400, 7_200, 3_600]);
  expect(parseOffsets('1h, 4h,2h 1h')).toEqual([14_400, 7_200, 3_600]);
  expect(parseOffsets('')).toEqual([]);
  expect(parseOffsets('2h 30m', 10_000)).toEqual([7_200, 1_800]);
});

test('an offset at or beyond the duration, or a bad entry, refuses the list', () => {
  expect(parseOffsets('4h 2h', 14_400)).toBeNull();
  expect(parseOffsets('4h soon')).toBeNull();
});

test('a duration formats with zero units left out', () => {
  expect(formatDuration(86_400 + 13 * 3_600 + 4 * 60 + 2)).toBe('1d 13h 4m 2s');
  expect(formatDuration(7_200)).toBe('2h');
  expect(formatDuration(0)).toBe('0s');
});
