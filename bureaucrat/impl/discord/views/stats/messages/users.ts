import type { Client } from 'discord.js';
import { clampPage, pageCount, pageItems } from '../../../../../engine/discord/components/pager';
import { select, selectRow, text } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import { listMemberMessageStats } from '../../../../../drizzle/stats';
import { parseRoles, ROLES, sortUsers, USER_SORTS, userStats, type UserStats } from '../../../games/stats/messages';
import { columnSelect, DEFAULT_USER_COLUMNS, parseColumns, rankColumn, statsTable, USER_COLUMNS } from '../columns';
import { pageNames } from '../names';
import { PAGE_SIZE } from '../tabs';
import type { MessagesState } from '../messages.view';
import { S } from '../../../../../strings';

const NAME_WIDTH = 18;

export const renderUsers = async (
  view: ViewRow<MessagesState>,
  state: MessagesState,
  guild: bigint,
  client: Client,
) => {
  const roles = parseRoles(state.roles);
  const users = sortUsers(userStats(await listMemberMessageStats(guild), roles), state.userSort, state.descending);
  const pages = pageCount(users.length, PAGE_SIZE);
  const page = clampPage(state.page, pages);
  const shown = pageItems(users, page, PAGE_SIZE);
  const name = await pageNames(
    client,
    shown.map((user) => user.member),
  );

  const columns = parseColumns(state.userColumns, USER_COLUMNS, DEFAULT_USER_COLUMNS);
  const table = statsTable(
    [
      rankColumn(page * PAGE_SIZE),
      { header: S.stats.columns.user, maxWidth: NAME_WIDTH, cell: (user: UserStats) => name(user.member) },
    ],
    USER_COLUMNS,
    columns,
    shown,
  );

  return {
    pages,
    body: [
      text(S.stats.usersTitle),
      text(`${shown.length > 0 ? table : S.stats.usersEmpty}${S.stats.pageOf(page, pages)}`),
    ],
    controls: [
      selectRow(
        select(view.customId('user-sort'), S.stats.sortPlaceholder).addOptions(
          USER_SORTS.map((sort) => ({
            label: S.stats.userSorts[sort],
            value: sort,
            default: sort === state.userSort,
          })),
        ),
      ),
      selectRow(
        select(view.customId('roles'), S.stats.rolesPlaceholder)
          .setMinValues(1)
          .setMaxValues(ROLES.length)
          .addOptions(
            ROLES.map((role) => ({ label: S.stats.roleLabels[role], value: role, default: roles.includes(role) })),
          ),
      ),
      columnSelect(view.customId('user-columns'), USER_COLUMNS, columns),
    ],
  };
};
