import { expect, test } from 'bun:test';
import { schedule, type Claimable, type Running } from '../../../impl/discord/games/offsite/schedule';

const now = new Date('2026-11-05T16:00:00Z');
const exp = (id: string, state: Claimable['state'], over: Partial<Claimable> = {}): Claimable => ({
  id,
  game: `g${id}`,
  state,
  notBefore: null,
  ...over,
});
const ids = (rows: Claimable[]) => rows.map((r) => r.id);

test('each phase fills only its own slots', () => {
  const claimable = [
    exp('1', 'copying'),
    exp('2', 'copying'),
    exp('3', 'copying'),
    exp('4', 'reading'),
    exp('5', 'reading'),
  ];
  expect(ids(schedule(claimable, new Map(), { reading: 1, copying: 2 }, now))).toEqual(['1', '2', '4']);
});

test('writers waiting on the thread window cannot starve the readers', () => {
  const running = new Map<string, Running>(
    Array.from({ length: 32 }, (_, i) => [`c${i}`, { phase: 'copying' as const, game: `gc${i}` }]),
  );
  expect(ids(schedule([exp('r', 'reading'), exp('c', 'copying')], running, { reading: 4, copying: 32 }, now))).toEqual([
    'r',
  ]);
});

test('a deferred export waits for its window, then is claimed', () => {
  const later = new Date(now.getTime() + 60_000);
  const deferred = [exp('1', 'copying', { notBefore: later }), exp('2', 'copying', { notBefore: now })];
  expect(ids(schedule(deferred, new Map(), { reading: 4, copying: 4 }, now))).toEqual(['2']);
  expect(ids(schedule(deferred, new Map(), { reading: 4, copying: 4 }, later))).toEqual(['1', '2']);
});

test('one job per game, whether running or picked in this pass', () => {
  const running = new Map<string, Running>([['a', { phase: 'reading', game: 'shared' }]]);
  const claimable = [
    exp('b', 'copying', { game: 'shared' }),
    exp('c', 'copying', { game: 'other' }),
    exp('d', 'reading', { game: 'other' }),
  ];
  expect(ids(schedule(claimable, running, { reading: 4, copying: 4 }, now))).toEqual(['c']);
});

test('a running export is not started twice', () => {
  const running = new Map<string, Running>([['1', { phase: 'copying', game: 'g1' }]]);
  expect(schedule([exp('1', 'copying')], running, { reading: 4, copying: 4 }, now)).toEqual([]);
});
