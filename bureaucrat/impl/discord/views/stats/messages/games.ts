import { clampPage, pageCount, pageItems } from '../../../../../engine/discord/components/pager';
import { select, selectRow, text } from '../../../../../engine/discord/elements';
import { asciiCell } from '../../../../../engine/discord/table';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import { listGameMessageStats } from '../../../../../drizzle/stats';
import { GAME_SORTS, sortGames, type GameStats } from '../../../games/stats/messages';
import { columnSelect, DEFAULT_GAME_COLUMNS, GAME_COLUMNS, parseColumns, rankColumn, statsTable } from '../columns';
import { PAGE_SIZE } from '../tabs';
import type { MessagesState } from '../messages.view';
import { S } from '../../../../../strings';

const NAME_WIDTH = 20;

export const renderGames = async (
  view: ViewRow<MessagesState>,
  state: MessagesState,
  guild: bigint,
  reading: number,
) => {
  const games = sortGames(await listGameMessageStats(guild), state.gameSort, state.descending);
  const pages = pageCount(games.length, PAGE_SIZE);
  const page = clampPage(state.page, pages);
  const shown = pageItems(games, page, PAGE_SIZE);
  const columns = parseColumns(state.gameColumns, GAME_COLUMNS, DEFAULT_GAME_COLUMNS);
  const table = statsTable(
    [
      rankColumn(page * PAGE_SIZE),
      { header: S.stats.columns.game, maxWidth: NAME_WIDTH, cell: (game: GameStats) => asciiCell(game.name) || '?' },
    ],
    GAME_COLUMNS,
    columns,
    shown,
  );

  return {
    pages,
    body: [
      text(S.stats.gamesTitle),
      text(
        `${shown.length > 0 ? table : S.stats.gamesEmpty}${reading > 0 ? S.stats.stillReading(reading) : ''}${S.stats.pageOf(page, pages)}`,
      ),
    ],
    controls: [
      selectRow(
        select(view.customId('game-sort'), S.stats.sortPlaceholder).addOptions(
          GAME_SORTS.map((sort) => ({
            label: S.stats.gameSorts[sort],
            value: sort,
            default: sort === state.gameSort,
          })),
        ),
      ),
      columnSelect(view.customId('game-columns'), GAME_COLUMNS, columns),
    ],
  };
};
