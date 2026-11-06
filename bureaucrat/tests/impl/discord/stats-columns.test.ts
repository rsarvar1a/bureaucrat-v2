import { test, expect } from 'bun:test';
import {
  DEFAULT_GAME_COLUMNS,
  GAME_COLUMNS,
  parseColumns,
  rankColumn,
  RANKING_COLUMNS,
  statsTable,
  USER_COLUMNS,
  type OptionalColumn,
} from '../../../impl/discord/views/stats/columns';

test('keys and headers are distinct in every table', () => {
  for (const columns of [RANKING_COLUMNS, GAME_COLUMNS, USER_COLUMNS] as OptionalColumn<string, never>[][]) {
    expect(new Set(columns.map((c) => c.key)).size).toBe(columns.length);
    expect(new Set(columns.map((c) => c.header)).size).toBe(columns.length);
  }
});

test('the ranking offers the columns asked for, under their full names', () => {
  expect(RANKING_COLUMNS.map((c) => c.header)).toEqual([
    'Played',
    'Win %',
    'Good win %',
    'Evil win %',
    'Evil rate',
    'Storytold',
  ]);
});

type Row = { name: string; n: number };
const COLUMNS: OptionalColumn<'n' | 'm', Row>[] = [
  { key: 'n', header: 'N', align: 'right', cell: (r) => String(r.n) },
  { key: 'm', header: 'M', align: 'right', cell: (r) => String(r.n * 2) },
];
const parse = (held: unknown) => parseColumns<'n' | 'm'>(held, COLUMNS, ['n']);

test('a selection comes back in table order, keeping only what exists', () => {
  expect(parse(['m', 'nope', 'n'])).toEqual(['n', 'm']);
});

test('an empty selection is kept, and no selection at all is the default', () => {
  expect(parse([])).toEqual([]);
  expect(parse(undefined)).toEqual(['n']);
});

test('the default for games is a subset that exists', () => {
  const keys = GAME_COLUMNS.map((c) => c.key);
  for (const key of DEFAULT_GAME_COLUMNS) expect(keys).toContain(key);
});

test('the table shows the fixed columns and only the selected others', () => {
  const fixed = [rankColumn(15), { header: 'Who', cell: (r: Row) => r.name }];
  const rows = [{ name: 'ann', n: 5 }];
  expect(statsTable(fixed, COLUMNS, ['m'], rows)).toBe(
    ['```', ' # | Who |  M', '---+-----+---', '16 | ann | 10', '```'].join('\n'),
  );
  expect(statsTable(fixed, COLUMNS, [], rows)).not.toContain('M');
});
