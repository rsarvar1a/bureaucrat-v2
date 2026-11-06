import { test, expect } from 'bun:test';
import {
  normalized,
  playerRecords,
  rateCell,
  shareCell,
  sortRecords,
  type PlayerRecord,
  type ResultRow,
} from '../../../impl/discord/games/stats/ranking';

const player = (member: bigint, winner: 'good' | 'evil', won: boolean): ResultRow => ({
  member,
  role: 'Player',
  winner,
  won,
});

test('under the threshold is padded up to it, half of the missing games won and half lost', () => {
  // 2 for 2 with N = 10: 8 missing, so 4 more wins over 10 games.
  expect(normalized(2, 2, 10)).toEqual({ value: 6 / 10, adjusted: true });
  expect(normalized(0, 9, 10)).toEqual({ value: 0.5 / 10, adjusted: true });
});

test('at or over the threshold is the plain record', () => {
  expect(normalized(10, 10, 10)).toEqual({ value: 1, adjusted: false });
  expect(normalized(6, 12, 10)).toEqual({ value: 0.5, adjusted: false });
});

test('a threshold of zero is off, and an odd one keeps its half', () => {
  expect(normalized(1, 1, 0)).toEqual({ value: 1, adjusted: false });
  expect(normalized(1, 2, 5)).toEqual({ value: 2.5 / 5, adjusted: true });
});

test('no games is no rate, not an even one', () => {
  expect(normalized(0, 0, 10)).toBeNull();
  expect(rateCell(null)).toBe('-');
});

test('the side compared with the threshold is the games on that side', () => {
  const rows = [
    ...Array.from({ length: 4 }, () => player(1n, 'good', true)),
    ...Array.from({ length: 2 }, () => player(1n, 'evil', true)),
  ];
  const [record] = playerRecords(rows, 4);
  expect(record!.win).toEqual({ value: 1, adjusted: false });
  expect(record!.good).toEqual({ value: 1, adjusted: false });
  expect(record!.evil).toEqual({ value: 3 / 4, adjusted: true });
});

test("a loser was on the side opposite the outcome's winner", () => {
  const [record] = playerRecords([player(1n, 'good', false), player(1n, 'evil', true)], 0);
  expect(record!.games).toBe(2);
  expect(record!.evil).toEqual({ value: 0.5, adjusted: false });
  expect(record!.good).toBeNull();
  expect(record!.evilShare).toBe(1);
});

test('a multicolour game counts once per result', () => {
  const [record] = playerRecords([player(1n, 'good', true), player(1n, 'evil', true)], 0);
  expect(record!.games).toBe(2);
  expect(record!.good?.value).toBe(1);
  expect(record!.evil?.value).toBe(1);
});

test('a Storyteller has games storytold and no rates; a Kibitzer is not listed', () => {
  const records = playerRecords(
    [
      { member: 1n, role: 'Storyteller', winner: 'good', won: false },
      { member: 2n, role: 'Kibitzer', winner: 'good', won: false },
    ],
    0,
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ member: 1n, games: 0, storytold: 1, win: null, evilShare: null });
});

const record = (member: bigint, games: number, evil: number | null): PlayerRecord => ({
  member,
  games,
  storytold: 0,
  win: null,
  good: null,
  evil: evil === null ? null : { value: evil, adjusted: false },
  evilShare: null,
});

test('a missing rate sorts last in either direction', () => {
  const records = [record(1n, 5, null), record(2n, 5, 0.2), record(3n, 5, 0.8)];
  expect(sortRecords(records, 'evil', true).map((r) => r.member)).toEqual([3n, 2n, 1n]);
  expect(sortRecords(records, 'evil', false).map((r) => r.member)).toEqual([2n, 3n, 1n]);
});

test('a tie goes to whoever played more, then to the lower id', () => {
  const records = [record(3n, 5, 0.5), record(2n, 9, 0.5), record(1n, 5, 0.5)];
  expect(sortRecords(records, 'evil', true).map((r) => r.member)).toEqual([2n, 1n, 3n]);
});

test('an adjusted rate is marked', () => {
  expect(rateCell({ value: 0.5, adjusted: true })).toBe('50.0*');
  expect(rateCell({ value: 0.5, adjusted: false })).toBe('50.0');
  expect(shareCell(0.273)).toBe('27.3');
  expect(shareCell(null)).toBe('-');
});
