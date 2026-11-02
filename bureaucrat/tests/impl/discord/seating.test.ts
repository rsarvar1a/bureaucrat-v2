import { test, expect } from 'bun:test';
import {
  appendSeats,
  arrangeSeats,
  cycleState,
  moveSeat,
  removeSeat,
  renumber,
  swapSeats,
} from '../../../impl/discord/games/seating';

const seats = (ids: string) => ids.split('').map((id, i) => ({ id, seat: i + 1 }));
const order = (rows: { id: string; seat: number }[]) => rows.map((r) => r.id).join('');
const contiguous = (rows: { seat: number }[]) => rows.every((r, i) => r.seat === i + 1);

test('renumber closes gaps and keeps order', () => {
  const rows = renumber([
    { id: 'c', seat: 9 },
    { id: 'a', seat: 2 },
    { id: 'b', seat: 5 },
  ]);
  expect(order(rows)).toBe('abc');
  expect(contiguous(rows)).toBe(true);
});

test('move shifts the neighbours in both directions and stays contiguous', () => {
  expect(order(moveSeat(seats('abcde'), 'd', 2))).toBe('adbce');
  expect(order(moveSeat(seats('abcde'), 'b', 4))).toBe('acdbe');
  expect(contiguous(moveSeat(seats('abcde'), 'b', 4))).toBe(true);
});

test('move to the same seat is identity, past the end clamps, unknown id is ignored', () => {
  expect(order(moveSeat(seats('abc'), 'b', 2))).toBe('abc');
  expect(order(moveSeat(seats('abc'), 'a', 99))).toBe('bca');
  expect(order(moveSeat(seats('abc'), 'a', -4))).toBe('abc');
  expect(order(moveSeat(seats('abc'), 'z', 1))).toBe('abc');
});

test('swap exchanges two seats and leaves the rest', () => {
  expect(order(swapSeats(seats('abcde'), 'b', 'e'))).toBe('aecdb');
  expect(order(swapSeats(seats('abc'), 'a', 'a'))).toBe('abc');
  expect(order(swapSeats(seats('abc'), 'a', 'z'))).toBe('abc');
});

test('remove closes the gap', () => {
  const rows = removeSeat(seats('abcd'), 'b');
  expect(order(rows)).toBe('acd');
  expect(contiguous(rows)).toBe(true);
});

test('append continues from the last seat', () => {
  const rows = appendSeats(seats('ab'), ['c', 'd']);
  expect(order(rows)).toBe('abcd');
  expect(rows[3]!.seat).toBe(4);
});

test('the life state cycles round in three', () => {
  expect(cycleState('alive')).toBe('dead');
  expect(cycleState('dead')).toBe('spent');
  expect(cycleState('spent')).toBe('alive');
});

test('a grimoire order lands on the named players alone, among the seats they hold', () => {
  const rows = [
    { id: 's1', seat: 1, player: 'sami' },
    { id: 's2', seat: 2, player: null },
    { id: 's3', seat: 3, player: 'ararat' },
    { id: 's4', seat: 4, player: 'dan' },
  ];
  const swapped = arrangeSeats(rows, ['ararat', 'sami']);
  expect(swapped.map((r) => [r.seat, r.player])).toEqual([
    [1, 'ararat'],
    [2, null],
    [3, 'sami'],
    [4, 'dan'],
  ]);
  expect(arrangeSeats(rows, ['sami', 'ararat'])).toEqual(rows);
  expect(arrangeSeats(rows, ['nobody', 'dan', 'sami']).map((r) => r.player)).toEqual(['dan', null, 'ararat', 'sami']);
});
