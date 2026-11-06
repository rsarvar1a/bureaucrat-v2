import { test, expect } from 'bun:test';
import { dueForAutoOpen } from '../../../impl/discord/games/nominations/engine';
import { votingOpen } from '../../../impl/discord/games/nominations/rules';

const day = (over: Partial<Parameters<typeof dueForAutoOpen>[0]> = {}) => ({
  phase: 'day' as const,
  createdAt: new Date('2026-11-02T10:00:00Z'),
  nominationsOpenedAt: null,
  nominationsClosedAt: null,
  ...over,
});

test('a day opens once its timer has run out, and not before', () => {
  expect(dueForAutoOpen(day(), 3600, new Date('2026-11-02T10:59:59Z'))).toBe(false);
  expect(dueForAutoOpen(day(), 3600, new Date('2026-11-02T11:00:00Z'))).toBe(true);
});

test('no timer, a night, or a day already opened or closed never opens', () => {
  const late = new Date('2026-11-03T00:00:00Z');
  expect(dueForAutoOpen(day(), null, late)).toBe(false);
  expect(dueForAutoOpen(day({ phase: 'night' }), 60, late)).toBe(false);
  expect(dueForAutoOpen(day({ nominationsOpenedAt: late }), 60, late)).toBe(false);
  expect(dueForAutoOpen(day({ nominationsClosedAt: late }), 60, late)).toBe(false);
});

test('closing nominations leaves voting open; only leaving the day shuts it', () => {
  const opened = new Date('2026-11-02T10:00:00Z');
  const today = { id: 'd1', nominationsOpenedAt: opened };
  expect(votingOpen(today, true, 'd1')).toBe(true);
  expect(votingOpen(today, true, 'n1')).toBe(false);
  expect(votingOpen(today, true, undefined)).toBe(false);
  expect(votingOpen(today, false, 'd1')).toBe(false);
  expect(votingOpen({ id: 'd1', nominationsOpenedAt: null }, true, 'd1')).toBe(false);
});
