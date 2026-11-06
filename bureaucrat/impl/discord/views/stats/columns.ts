import { asciiTable, type TableColumn } from '../../../../engine/discord/table';
import { select, selectRow } from '../../../../engine/discord/elements';
import { daysOf, type GameStats, type UserStats } from '../../games/stats/messages';
import { rateCell, shareCell, type PlayerRecord } from '../../games/stats/ranking';
import { S } from '../../../../strings';

/** A column a viewer can always see: the rank and who the row is about. */
export type FixedColumn<R> = TableColumn & { cell: (row: R, index: number) => string };

/** A column a viewer can turn off, so a narrow screen can keep the ones it cares about. */
export type OptionalColumn<K extends string, R> = TableColumn & { key: K; cell: (row: R) => string };

const number = (n: number) => n.toLocaleString('en-US');
const day = (at: Date | null) => at?.toISOString().slice(0, 10) ?? '-';

const C = S.stats.columns;
const SHORT = S.stats.shortColumns;

export const RANKING_COLUMNS: OptionalColumn<
  'played' | 'win' | 'good' | 'evil' | 'evilShare' | 'storytold',
  PlayerRecord
>[] = [
  { key: 'played', header: C.played, short: SHORT.played, align: 'right', cell: (r) => number(r.games) },
  { key: 'win', header: C.win, short: SHORT.win, align: 'right', cell: (r) => rateCell(r.win) },
  { key: 'good', header: C.good, short: SHORT.good, align: 'right', cell: (r) => rateCell(r.good) },
  { key: 'evil', header: C.evil, short: SHORT.evil, align: 'right', cell: (r) => rateCell(r.evil) },
  {
    key: 'evilShare',
    header: C.evilShare,
    short: SHORT.evilShare,
    align: 'right',
    cell: (r) => shareCell(r.evilShare),
  },
  { key: 'storytold', header: C.storytold, short: SHORT.storytold, align: 'right', cell: (r) => number(r.storytold) },
];
export type RankingColumn = (typeof RANKING_COLUMNS)[number]['key'];
export const DEFAULT_RANKING_COLUMNS: RankingColumn[] = RANKING_COLUMNS.map((column) => column.key);

export const GAME_COLUMNS: OptionalColumn<
  'winner' | 'messages' | 'threads' | 'members' | 'days' | 'started' | 'ended',
  GameStats
>[] = [
  { key: 'winner', header: C.winner, cell: (g) => g.winner ?? '-' },
  { key: 'messages', header: C.messages, short: SHORT.messages, align: 'right', cell: (g) => number(g.messages) },
  { key: 'threads', header: C.threads, short: SHORT.threads, align: 'right', cell: (g) => number(g.threads) },
  { key: 'members', header: C.members, short: SHORT.members, align: 'right', cell: (g) => number(g.authors) },
  { key: 'days', header: C.days, align: 'right', cell: (g) => daysOf(g.firstAt, g.lastAt).toFixed(1) },
  { key: 'started', header: C.started, cell: (g) => day(g.firstAt) },
  { key: 'ended', header: C.ended, cell: (g) => day(g.lastAt) },
];
export type GameColumn = (typeof GAME_COLUMNS)[number]['key'];
// Beside a game's name, more of these would not fit a line of a code block.
export const DEFAULT_GAME_COLUMNS: GameColumn[] = ['winner', 'messages', 'days', 'ended'];

export const USER_COLUMNS: OptionalColumn<'messages' | 'games' | 'perGame' | 'perDay', UserStats>[] = [
  { key: 'messages', header: C.messages, short: SHORT.messages, align: 'right', cell: (u) => number(u.messages) },
  { key: 'games', header: C.games, short: SHORT.games, align: 'right', cell: (u) => number(u.games) },
  { key: 'perGame', header: C.perGame, short: SHORT.perGame, align: 'right', cell: (u) => u.perGame.toFixed(1) },
  { key: 'perDay', header: C.perDay, short: SHORT.perDay, align: 'right', cell: (u) => u.perDay.toFixed(1) },
];
export type UserColumn = (typeof USER_COLUMNS)[number]['key'];
export const DEFAULT_USER_COLUMNS: UserColumn[] = USER_COLUMNS.map((column) => column.key);

/**
 * The columns held in state, in their table's order. An empty selection is a
 * choice, leaving only the fixed columns; anything else that is not a list
 * predates the setting.
 */
export const parseColumns = <K extends string>(held: unknown, columns: { key: K }[], fallback: K[]): K[] =>
  Array.isArray(held) ? columns.map((column) => column.key).filter((key) => held.includes(key)) : fallback;

export const rankColumn = (offset: number): FixedColumn<unknown> => ({
  header: C.rank,
  align: 'right',
  cell: (_row, index) => String(offset + index + 1),
});

export const statsTable = <K extends string, R>(
  fixed: FixedColumn<R>[],
  columns: OptionalColumn<K, R>[],
  selected: K[],
  rows: R[],
): string => {
  const shown = columns.filter((column) => selected.includes(column.key));
  return asciiTable(
    [...fixed, ...shown],
    rows.map((row, index) => [...fixed.map((c) => c.cell(row, index)), ...shown.map((c) => c.cell(row))]),
  );
};

export const columnSelect = <K extends string, R>(customId: string, columns: OptionalColumn<K, R>[], selected: K[]) =>
  selectRow(
    select(customId, S.stats.columnsPlaceholder)
      .setMinValues(0)
      .setMaxValues(columns.length)
      .addOptions(
        columns.map((column) => ({
          label: column.header,
          value: column.key,
          default: selected.includes(column.key),
        })),
      ),
  );
