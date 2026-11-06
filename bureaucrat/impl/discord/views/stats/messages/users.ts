import type { Client } from 'discord.js';
import { clampPage, pageCount, pageItems } from '../../../../../engine/discord/components/pager';
import { select, selectRow, text } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import { listMemberMessageStats } from '../../../../../drizzle/stats';
import { parseRoles, ROLES, sortUsers, USER_SORTS, userStats } from '../../../games/stats/messages';
import { pageNames } from '../names';
import { PAGE_SIZE } from '../tabs';
import type { MessagesState } from '../messages.view';
import { S } from '../../../../../strings';

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
    guild,
    shown.map((user) => user.member),
  );

  const lines = shown.map(
    (user, i) =>
      `${page * PAGE_SIZE + i + 1}. **${name(user.member)}** · ${S.stats.count(user.messages, 'message')}` +
      ` · ${S.stats.count(user.games, 'game')} · ${user.perGame.toFixed(1)} per game · ${user.perDay.toFixed(1)} per day`,
  );

  return {
    pages,
    body: [text(S.stats.usersTitle), text(`${lines.join('\n') || S.stats.usersEmpty}${S.stats.pageOf(page, pages)}`)],
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
    ],
  };
};
