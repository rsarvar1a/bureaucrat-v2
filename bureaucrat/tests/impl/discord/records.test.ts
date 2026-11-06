import { test, expect } from 'bun:test';
import {
  grouped,
  lostAs,
  matches,
  paginate,
  recordLines,
  sorted,
  type GameRecord,
  type RecordResult,
} from '../../../impl/discord/games/records';

const record = (over: Partial<GameRecord> = {}): GameRecord => ({
  id: 'g',
  name: 'Trouble',
  state: 'running',
  channel: 5n,
  endedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  role: 'Player',
  trueRole: null,
  trueAlignment: null,
  results: [],
  ...over,
});

const result = (over: Partial<RecordResult> = {}): RecordResult => ({
  position: 1,
  winner: 'good',
  wonAs: null,
  won: false,
  ...over,
});

const look = {
  roleTag: (role: string, alignment: string | null) => `<:${role}_${alignment ?? 'x'}:>`,
  teamOf: (role: string | null | undefined) => (role === 'Imp' ? 'demon' : role === 'Chef' ? 'townsfolk' : null),
} as const;

test('an entry says where, when, as whom and how it went', () => {
  expect(recordLines(record({ trueRole: 'Chef' }), look)).toEqual([
    '**Trouble**',
    '-# in <#5> · in progress',
    '-# participating as the <:Chef_x:>',
  ]);
  const ended = new Date('2026-02-01T00:00:00Z');
  expect(
    recordLines(record({ state: 'completed', endedAt: ended, trueRole: 'Imp', results: [result()] }), look),
  ).toEqual([
    '**Trouble**',
    `-# in <#5> · finished on <t:${Math.floor(ended.getTime() / 1000)}:D>`,
    '-# participated as the <:Imp_x:>',
    '-# lost with Evil',
  ]);
  expect(
    recordLines(record({ state: 'completed', endedAt: ended, results: [result({ won: true, wonAs: 'good' })] }), look),
  ).toContain('-# won with Good');
  expect(recordLines(record({ role: 'Storyteller', channel: null }), look)).toEqual([
    '**Trouble**',
    '-# in progress',
    '-# participating as the Storyteller',
  ]);
  expect(recordLines(record({ role: 'Kibitzer', state: 'signups' }), look)).toEqual([
    '**Trouble**',
    '-# in <#5> · taking signups',
  ]);
});

test('a lost game is lost with the seat side, the role team, or the side that did not win', () => {
  expect(lostAs(record({ trueAlignment: 'good', trueRole: 'Imp' }), 'evil', look.teamOf)).toBe('good');
  expect(lostAs(record({ trueRole: 'Imp' }), 'good', look.teamOf)).toBe('evil');
  expect(lostAs(record(), 'good', look.teamOf)).toBe('evil');
});

test('a multicolour game shows each result, sides read from who won rather than the one seat', () => {
  const both = record({
    state: 'completed',
    trueAlignment: 'good',
    results: [
      result({ position: 1, winner: 'good', won: true, wonAs: 'good' }),
      result({ position: 2, winner: 'good' }),
    ],
  });
  expect(recordLines(both, look).slice(-2)).toEqual(['-# Colour 1: won with Good', '-# Colour 2: lost with Evil']);
  expect(matches(both, 'won')).toBe(true);
  expect(matches(both, 'lost')).toBe(true);
});

test('a finished game with no result on record shows none and is neither won nor lost', () => {
  const bare = record({ state: 'completed' });
  expect(recordLines(bare, look).some((line) => /won|lost/.test(line))).toBe(false);
  expect(matches(bare, 'won')).toBe(false);
  expect(matches(bare, 'lost')).toBe(false);
});

test('filters read the state, the role and the outcome', () => {
  const won = record({ state: 'completed', results: [result({ won: true })] });
  const lost = record({ state: 'completed', results: [result()] });
  const st = record({ role: 'Storyteller', state: 'completed' });
  expect(matches(won, 'won')).toBe(true);
  expect(matches(lost, 'won')).toBe(false);
  expect(matches(lost, 'lost')).toBe(true);
  expect(matches(st, 'lost')).toBe(false);
  expect(matches(st, 'storyteller')).toBe(true);
  expect(matches(record(), 'running')).toBe(true);
  expect(matches(record(), 'completed')).toBe(false);
  expect(matches(record(), 'all')).toBe(true);
});

test('sorting flips with the direction, and unfinished games end the list either way', () => {
  const a = record({ id: 'a', name: 'Alpha', createdAt: new Date(1000), endedAt: new Date(5000) });
  const b = record({ id: 'b', name: 'Beta', createdAt: new Date(2000), endedAt: null });
  const c = record({ id: 'c', name: 'Gamma', createdAt: new Date(3000), endedAt: new Date(4000) });
  const ids = (rows: GameRecord[]) => rows.map((r) => r.id);
  expect(ids(sorted([b, c, a], 'created', false))).toEqual(['a', 'b', 'c']);
  expect(ids(sorted([b, c, a], 'created', true))).toEqual(['c', 'b', 'a']);
  expect(ids(sorted([b, c, a], 'name', true))).toEqual(['c', 'b', 'a']);
  expect(ids(sorted([b, c, a], 'ended', false))).toEqual(['c', 'a', 'b']);
  expect(ids(sorted([b, c, a], 'ended', true))).toEqual(['a', 'c', 'b']);
});

test('groups keep their fixed order and empty ones are left out', () => {
  const rows = [record({ state: 'completed' }), record({ state: 'signups', role: 'Storyteller' })];
  expect(grouped(rows, 'state').map((g) => g.title)).toEqual(['Taking signups', 'Finished']);
  expect(grouped(rows, 'role').map((g) => g.title)).toEqual(['As a Player', 'As a Storyteller']);
  expect(grouped(rows, null)).toHaveLength(1);
  expect(grouped([], null)).toEqual([]);
});

test('pages keep every entry whole and carry a split group on under its title', () => {
  const block = 'x'.repeat(100);
  const pages = paginate(
    [
      { title: 'One', blocks: [block, block, block] },
      { title: 'Two', blocks: [block] },
    ],
    260,
  );
  expect(pages.map((p) => p.map((s) => [s.title, s.blocks.length]))).toEqual([
    [['One', 2]],
    [
      ['One', 1],
      ['Two', 1],
    ],
  ]);
  expect(paginate([{ title: 'Big', blocks: ['y'.repeat(500)] }], 100)).toHaveLength(1);
});
