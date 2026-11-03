import { test, expect } from 'bun:test';
import {
  FIRST,
  fromOrdinal,
  key,
  label,
  next,
  ordinal,
  parse,
  previous,
  sequence,
  shift,
} from '../../../impl/discord/games/phases';

test('play order is Night 1, Day 1, Night 2, Day 2', () => {
  expect(sequence({ phase: 'day', on: 2 }).map(label)).toEqual(['Night 1', 'Day 1', 'Night 2', 'Day 2']);
});

test('next and previous walk the order and meet in the middle', () => {
  expect(next(FIRST)).toEqual({ phase: 'day', on: 1 });
  expect(next({ phase: 'day', on: 1 })).toEqual({ phase: 'night', on: 2 });
  expect(previous({ phase: 'night', on: 2 })).toEqual({ phase: 'day', on: 1 });
  expect(previous(next(FIRST))).toEqual(FIRST);
});

test('there is nothing before the first night', () => {
  expect(previous(FIRST)).toBeNull();
});

test('ordinals round-trip', () => {
  for (let n = 1; n <= 10; n++) expect(ordinal(fromOrdinal(n))).toBe(n);
});

test('a select value parses back to the phase, and garbage to null', () => {
  expect(parse(key({ phase: 'day', on: 3 }))).toEqual({ phase: 'day', on: 3 });
  expect(parse('dusk:1')).toBeNull();
  expect(parse('day:0')).toBeNull();
  expect(parse('day:x')).toBeNull();
});

test('a shift moves by phases and stops at the first night', () => {
  expect(shift(FIRST, 2)).toEqual({ phase: 'night', on: 2 });
  expect(shift({ phase: 'day', on: 3 }, -2)).toEqual({ phase: 'day', on: 2 });
  expect(shift({ phase: 'day', on: 1 }, -2)).toEqual(FIRST);
  expect(shift(FIRST, -1)).toEqual(FIRST);
});
