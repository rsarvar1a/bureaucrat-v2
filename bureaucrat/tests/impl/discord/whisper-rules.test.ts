import { test, expect } from 'bun:test';
import {
  affordable,
  budget,
  costs,
  defaultWhispers,
  lockOnClose,
  neighbours,
  promotable,
  remainingAfter,
  renamedWhisperThread,
  restricts,
  setTag,
  whisperThreadName,
} from '../../../impl/discord/games/whispers/rules';

const settings = (over: Partial<Parameters<typeof budget>[0]> = {}) => ({
  whisperMode: 'sync' as const,
  whispersPerDay: 3,
  asyncWhispersPerDay: 1,
  travelerWhispers: false,
  groupWhispers: false,
  neighbourWhispers: false,
  ...over,
});

test('the allowance follows the mode', () => {
  expect(budget(settings(), 10)).toEqual({ total: 3, async: 0 });
  expect(budget(settings({ whisperMode: 'async' }), 10)).toEqual({ total: 1, async: 1 });
  expect(budget(settings({ whisperMode: 'hybrid' }), 10)).toEqual({ total: 3, async: 1 });
  expect(budget(settings({ whisperMode: 'hybrid', asyncWhispersPerDay: 5 }), 10)).toEqual({ total: 3, async: 3 });
});

test('a count left to the table is one per evil player in the base counts', () => {
  const table: [number, number][] = [
    [5, 2],
    [6, 2],
    [7, 2],
    [8, 2],
    [9, 2],
    [10, 3],
    [11, 3],
    [12, 3],
    [13, 4],
    [14, 4],
    [15, 4],
  ];
  for (const [players, whispers] of table) expect(defaultWhispers(players)).toBe(whispers);
  expect(defaultWhispers(0)).toBe(2);
  expect(defaultWhispers(20)).toBe(4);
  expect(budget(settings({ whispersPerDay: null }), 12)).toEqual({ total: 3, async: 0 });
  expect(budget(settings({ whispersPerDay: null, whisperMode: 'hybrid', asyncWhispersPerDay: 5 }), 7)).toEqual({
    total: 2,
    async: 2,
  });
});

const ann = { id: 'ann', traveler: false };
const bob = { id: 'bob', traveler: false };
const tom = { id: 'tom', traveler: true };

test('a whisper costs each one per other participant', () => {
  expect([...costs([ann, bob], false, false)]).toEqual([
    ['ann', 1],
    ['bob', 1],
  ]);
  expect(costs([ann, bob, tom], false, false).get('ann')).toBe(2);
});

test('with the traveler rule a regular player does not pay for travelers, and travelers pay in full', () => {
  const c = costs([ann, bob, tom], true, false);
  expect(c.get('ann')).toBe(1);
  expect(c.get('bob')).toBe(1);
  expect(c.get('tom')).toBe(2);
  expect(costs([ann, tom], true, false).get('ann')).toBe(0);
  expect(costs([ann, tom], true, false).get('tom')).toBe(1);
});

test('a free whisper costs nobody anything', () => {
  for (const cost of costs([ann, bob, tom], true, true).values()) expect(cost).toBe(0);
});

test('affordable on the total, and on the async count too when it is async', () => {
  const allowance = { total: 2, async: 1 };
  expect(affordable({ total: 1, async: 0 }, 1, false, allowance)).toBe(true);
  expect(affordable({ total: 2, async: 0 }, 1, false, allowance)).toBe(false);
  expect(affordable({ total: 0, async: 1 }, 1, true, allowance)).toBe(false);
  expect(affordable({ total: 0, async: 0 }, 1, true, allowance)).toBe(true);
  expect(affordable({ total: 2, async: 0 }, 0, false, allowance)).toBe(true);
});

test('neighbours sit next to each other round the table', () => {
  expect(neighbours(1, 2, 5)).toBe(true);
  expect(neighbours(5, 1, 5)).toBe(true);
  expect(neighbours(1, 3, 5)).toBe(false);
  expect(neighbours(2, 2, 5)).toBe(false);
  expect(neighbours(1, 2, 2)).toBe(true);
  expect(neighbours(1, 1, 1)).toBe(false);
});

test('a thread is named for its people and tagged by their set', () => {
  expect(whisperThreadName(['Ann Lee', 'Bob!'])).toBe('Whisper - Ann Lee, Bob!');
  expect(whisperThreadName(['Ann', 'Bob'], true)).toBe('Neighbours - Ann and Bob');
  expect(whisperThreadName(['Ann', 'Bob', 'Cat'], true)).toBe('Whisper - Ann, Bob, Cat');
  expect(whisperThreadName(['x'.repeat(120)]).length).toBeLessThanOrEqual(100);
  expect(renamedWhisperThread(false, '  the plan  ')).toBe('Whisper - the plan');
  expect(renamedWhisperThread(true, 'x'.repeat(120)).length).toBeLessThanOrEqual(100);
  expect(setTag(['b', 'a'])).toBe(setTag(['a', 'b']));
  expect(setTag(['a', 'b'])).not.toBe(setTag(['a', 'b', 'c']));
});

test('an open synchronous whisper keeps a member out of town until they end their part', () => {
  const open = { state: 'accepted', async: false, free: false };
  expect(restricts(open, { endedAt: null })).toBe(true);
  expect(restricts(open, { endedAt: new Date() })).toBe(false);
  expect(restricts({ ...open, async: true }, { endedAt: null })).toBe(false);
  expect(restricts({ ...open, free: true }, { endedAt: null })).toBe(false);
  expect(restricts({ ...open, state: 'pending' }, { endedAt: null })).toBe(false);
  expect(restricts({ ...open, state: 'ended' }, { endedAt: null })).toBe(false);
});

test('a closed thread locks unless it is two neighbours under the neighbour rule', () => {
  expect(lockOnClose(true, [1, 2], 5)).toBe(false);
  expect(lockOnClose(true, [5, 1], 5)).toBe(false);
  expect(lockOnClose(false, [1, 2], 5)).toBe(true);
  expect(lockOnClose(true, [1, 3], 5)).toBe(true);
  expect(lockOnClose(true, [1, 2, 3], 5)).toBe(true);
  expect(lockOnClose(true, [1, undefined], 5)).toBe(true);
});

test('promotion only needs room on the async counter', () => {
  const allowance = { total: 2, async: 1 };
  expect(promotable({ total: 2, async: 0 }, 1, allowance)).toBe(true);
  expect(promotable({ total: 2, async: 1 }, 1, allowance)).toBe(false);
  expect(promotable({ total: 1, async: 0 }, 2, allowance)).toBe(false);
});

test('who remains after a leave: the second-last out leaves nobody worth keeping, more carry on', () => {
  const open = (participant: string) => ({ participant, endedAt: null });
  const gone = (participant: string) => ({ participant, endedAt: new Date() });
  expect(remainingAfter([open('a'), open('b')], 'a')).toEqual(['b']);
  expect(remainingAfter([open('a'), open('b'), open('c')], 'c')).toEqual(['a', 'b']);
  expect(remainingAfter([open('a'), open('b'), gone('c')], 'b')).toEqual(['a']);
  expect(remainingAfter([open('a'), gone('b')], 'a')).toEqual([]);
});
