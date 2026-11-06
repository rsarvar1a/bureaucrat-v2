import { ButtonStyle } from 'discord.js';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { pager } from '../../../../engine/discord/components/pager';
import { tabs } from '../../../../engine/discord/components/tabs';
import { accent, button, linear, separator, v2 } from '../../../../engine/discord/elements';
import { createView } from '../../../../engine/discord/views/create-view';
import type { InteractionHandler } from '../../../../engine/discord/views/types';
import {
  GAME_SORTS,
  parseRoles,
  ROLES,
  USER_SORTS,
  type GameSort,
  type Role,
  type UserSort,
} from '../../games/stats/messages';
import { refreshMessageStats } from '../../games/stats/refresh';
import { inGuild } from '../../guards';
import {
  DEFAULT_GAME_COLUMNS,
  DEFAULT_USER_COLUMNS,
  GAME_COLUMNS,
  parseColumns,
  USER_COLUMNS,
  type GameColumn,
  type UserColumn,
} from './columns';
import { renderGames } from './messages/games';
import { renderUsers } from './messages/users';
import { TABS, type MessagesTab } from './tabs';
import { S } from '../../../../strings';

export type MessagesState = {
  tab: MessagesTab;
  gameSort: GameSort;
  userSort: UserSort;
  descending: boolean;
  roles: Role[];
  gameColumns: GameColumn[];
  userColumns: UserColumn[];
  page: number;
};

const DEFAULT_STATE: MessagesState = {
  tab: 'games',
  gameSort: 'messages',
  userSort: 'messages',
  descending: true,
  roles: ROLES,
  gameColumns: DEFAULT_GAME_COLUMNS,
  userColumns: DEFAULT_USER_COLUMNS,
  page: 0,
};

const dismiss = dismissButton<MessagesState>()({ action: 'dismiss' });
const strip = tabs<MessagesState>()({ field: 'tab', tabs: TABS, fallback: 'games' });
const pages = pager<MessagesState>()({ field: 'page' });

// A page number means nothing on the other tab's list.
const switching = Object.fromEntries(
  strip.actions.map((action) => [
    action,
    (async (interaction, ctx) => {
      const result = await strip.interactions[action](interaction, ctx);
      await ctx.updateState({ page: 0 });
      return result;
    }) satisfies InteractionHandler<MessagesState>,
  ]),
) as typeof strip.interactions;

/**
 * Who said how much, read from the counts `refreshMessageStats` keeps: a Games
 * tab and a Users tab, sorted and paged per viewer. The first render in a server
 * can take seconds, and every path here defers before rendering.
 */
export default createView<MessagesState>()({
  id: 'statsmessages',
  idParams: [],
  events: {},
  defaultState: DEFAULT_STATE,
  subscribesTo: {},
  guards: { '*': [inGuild] },

  render: async (view, _db, client) => {
    const state = { ...DEFAULT_STATE, ...view.state };
    const guild = BigInt(view.entityId!);
    const { reading } = await refreshMessageStats(guild);

    const face =
      strip.active(view) === 'users'
        ? await renderUsers(view, state, guild, client)
        : await renderGames(view, state, guild, reading);

    return {
      ...v2(
        linear(
          // Controls for the list share the strip's row: the Users tab has none to spare.
          strip.row(
            view,
            button(
              view.customId('direction'),
              state.descending ? S.stats.descending : S.stats.ascending,
              ButtonStyle.Secondary,
            ),
            ...pages.buttons(view, face.pages),
          ),
          separator(),
          ...face.body,
          separator(),
          ...face.controls,
          separator(),
          dismiss.row(view),
        ).setAccentColor(accent.brand),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...dismiss.interactions,
    ...switching,
    ...pages.interactions,

    'game-sort': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      const gameSort = interaction.values[0] as GameSort;
      if (GAME_SORTS.includes(gameSort)) await ctx.updateState({ gameSort, page: 0 });
      return { action: 'render' };
    },

    'user-sort': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      const userSort = interaction.values[0] as UserSort;
      if (USER_SORTS.includes(userSort)) await ctx.updateState({ userSort, page: 0 });
      return { action: 'render' };
    },

    roles: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ roles: parseRoles(interaction.values), page: 0 });
      return { action: 'render' };
    },

    'game-columns': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({
        gameColumns: parseColumns(interaction.values, GAME_COLUMNS, DEFAULT_GAME_COLUMNS),
      });
      return { action: 'render' };
    },

    'user-columns': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({
        userColumns: parseColumns(interaction.values, USER_COLUMNS, DEFAULT_USER_COLUMNS),
      });
      return { action: 'render' };
    },

    direction: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ descending: !(ctx.view.state?.descending ?? true), page: 0 });
      return { action: 'render' };
    },
  },
});
