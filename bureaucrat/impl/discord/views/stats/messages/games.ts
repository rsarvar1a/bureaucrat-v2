import { clampPage, pageCount, pageItems } from '../../../../../engine/discord/components/pager';
import { select, selectRow, text } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import { listGameMessageStats } from '../../../../../drizzle/stats';
import { daysOf, GAME_SORTS, sortGames, type GameStats } from '../../../games/stats/messages';
import { PAGE_SIZE } from '../tabs';
import type { MessagesState } from '../messages.view';
import { S } from '../../../../../strings';

const day = (at: Date | null) => at?.toISOString().slice(0, 10) ?? '?';

const line = (game: GameStats, position: number) =>
  `${position}. **${game.name}**${game.winner ? ` · ${game.winner}` : ''} · ${S.stats.count(game.messages, 'message')}` +
  ` · ${S.stats.count(game.threads, 'thread')} · ${S.stats.count(game.authors, 'member')} · ${daysOf(game.firstAt, game.lastAt).toFixed(1)}d` +
  ` · ${day(game.firstAt)} → ${day(game.lastAt)}`;

export const renderGames = async (
  view: ViewRow<MessagesState>,
  state: MessagesState,
  guild: bigint,
  reading: number,
) => {
  const games = sortGames(await listGameMessageStats(guild), state.gameSort, state.descending);
  const pages = pageCount(games.length, PAGE_SIZE);
  const page = clampPage(state.page, pages);
  const lines = pageItems(games, page, PAGE_SIZE).map((game, i) => line(game, page * PAGE_SIZE + i + 1));

  return {
    pages,
    body: [
      text(S.stats.gamesTitle),
      text(
        `${lines.join('\n') || S.stats.gamesEmpty}${reading > 0 ? S.stats.stillReading(reading) : ''}${S.stats.pageOf(page, pages)}`,
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
    ],
  };
};
