import { test, expect } from 'bun:test';
import { freeSlots, nextClaimant } from '../../../impl/discord/games/vacancy';

const NOW = new Date('2026-11-01T12:00:00Z');
const LATER = new Date('2026-12-01T12:00:00Z');

const entry = (id: string, minimumStartDate: Date | null = null) => ({ id, storyteller: 1n, minimumStartDate });

test('no concurrency means no cap', () => {
  expect(freeSlots(null, 99)).toBe(Number.POSITIVE_INFINITY);
});

test('free slots never go negative, even when the cap was lowered under running games', () => {
  expect(freeSlots(2, 1)).toBe(1);
  expect(freeSlots(1, 3)).toBe(0);
});

test('the first ready entry is offered, in queue order', () => {
  expect(nextClaimant([entry('a', LATER), entry('b'), entry('c')], [], NOW)?.id).toBe('b');
});

test('an entry that passed on this vacancy is skipped', () => {
  expect(nextClaimant([entry('a'), entry('b')], ['a'], NOW)?.id).toBe('b');
  expect(nextClaimant([entry('a')], ['a'], NOW)).toBeNull();
});

test('nobody ready means nobody offered', () => {
  expect(nextClaimant([entry('a', LATER)], [], NOW)).toBeNull();
  expect(nextClaimant([], [], NOW)).toBeNull();
});
