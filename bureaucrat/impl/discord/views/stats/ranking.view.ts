import { ButtonStyle } from 'discord.js';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { clampPage, pageCount, pageItems, pager } from '../../../../engine/discord/components/pager';
import {
  button,
  buttonRow,
  linear,
  select,
  selectRow,
  separator,
  text,
  v2,
  accent,
} from '../../../../engine/discord/elements';
import { createView } from '../../../../engine/discord/views/create-view';
import { getOrCreateGuildSettings } from '../../../../drizzle/guild-settings';
import { listPlayerResults } from '../../../../drizzle/stats';
import {
  percent,
  playerRecords,
  rateText,
  RANKING_SORTS,
  sortRecords,
  type RankingSort,
} from '../../games/stats/ranking';
import { inGuild } from '../../guards';
import { pageNames } from './names';
import { S } from '../../../../strings';

export type RankingState = { sort: RankingSort; descending: boolean; page: number };

const DEFAULT_STATE: RankingState = { sort: 'games', descending: true, page: 0 };
const PAGE_SIZE = 15;

const dismiss = dismissButton<RankingState>()({ action: 'dismiss' });
const pages = pager<RankingState>()({ field: 'page' });

/** Every player in the server with their record, sorted and paged per viewer. */
export default createView<RankingState>()({
  id: 'statsranking',
  idParams: [],
  events: {},
  defaultState: DEFAULT_STATE,
  subscribesTo: {},
  guards: { '*': [inGuild] },

  render: async (view, _db, client) => {
    const state = { ...DEFAULT_STATE, ...view.state };
    const guild = BigInt(view.entityId!);

    const [rows, settings] = await Promise.all([listPlayerResults(guild), getOrCreateGuildSettings(guild)]);
    const threshold = settings.statsNormalization;
    const records = sortRecords(playerRecords(rows, threshold), state.sort, state.descending);

    const total = pageCount(records.length, PAGE_SIZE);
    const page = clampPage(state.page, total);
    const shown = pageItems(records, page, PAGE_SIZE);
    const name = await pageNames(
      client,
      guild,
      shown.map((record) => record.member),
    );

    const lines = shown.map(
      (record, i) =>
        `${page * PAGE_SIZE + i + 1}. **${name(record.member)}** · ${S.stats.count(record.games, 'game')} · ${rateText(record.win)}` +
        ` · Good ${rateText(record.good)} · Evil ${rateText(record.evil)}` +
        (record.evilShare === null ? '' : ` · ${percent(record.evilShare)} evil`) +
        (record.storytold > 0 ? ` · ST ${record.storytold}` : ''),
    );

    return {
      ...v2(
        linear(
          text(S.stats.rankingTitle),
          text(
            `${lines.join('\n') || S.stats.rankingEmpty}${S.stats.rankingFootnote(threshold)}${S.stats.pageOf(page, total)}`,
          ),
          separator(),
          selectRow(
            select(view.customId('sort'), S.stats.sortPlaceholder).addOptions(
              RANKING_SORTS.map((sort) => ({
                label: S.stats.rankingSorts[sort],
                value: sort,
                default: sort === state.sort,
              })),
            ),
          ),
          buttonRow(
            button(
              view.customId('direction'),
              state.descending ? S.stats.descending : S.stats.ascending,
              ButtonStyle.Secondary,
            ),
            ...pages.buttons(view, total),
            dismiss.button(view),
          ),
        ).setAccentColor(accent.brand),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...dismiss.interactions,
    ...pages.interactions,

    sort: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      const sort = interaction.values[0] as RankingSort;
      if (RANKING_SORTS.includes(sort)) await ctx.updateState({ sort, page: 0 });
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
