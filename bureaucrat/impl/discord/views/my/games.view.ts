import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  select,
  selectRow,
  v2,
  type ContainerChild,
} from '../../../../engine/discord/elements';
import { listGameRecordsByMember } from '../../../../drizzle/games';
import { listSignupsByMemberInGuild } from '../../../../drizzle/queue-entry-signups';
import { getScriptSummary } from '../../../../drizzle/scripts';
import { inGuild } from '../../guards';
import {
  FILTER_LABEL,
  FILTERS,
  GROUPING_LABEL,
  GROUPINGS,
  grouped,
  matches,
  paginate,
  parse,
  recordLines,
  SORT_LABEL,
  SORTS,
  sorted,
  STATE_FILTERS,
  type Filter,
  type GameRecord,
  type Grouping,
  type Sort,
} from '../../games/records';
import { characterChoices } from '../games/seating/roles';
import { roleLook, roleTag } from '../games/seating/render';
import { S } from '../../../../strings';

/** `games` is `/my signups`: Players and Storytellers; `kibitz` is `/my kibitz`, which lists the rest. */
export type MyGamesState = {
  kind: 'games' | 'kibitz';
  grouping: Grouping;
  filter: Filter;
  sort: Sort;
  descending: boolean;
  page: number;
};

/** What one message may say, leaving room for the heading and the signups. */
const PAGE_BUDGET = 3200;

const dismiss = dismissButton<MyGamesState>()({ action: 'dismiss' });

const option = <K extends string>(labels: Record<K, string>, keys: K[], current: K) =>
  keys.map((key) => ({ label: labels[key], value: key, default: key === current }));

/**
 * The games a member is or was in, ephemeral from `/my signups` and
 * `/my kibitz`: grouped by state or by role, filtered, sorted either way,
 * paged under the message's text budget. Bound to the guild (`entityId`),
 * listed for the member who opened it.
 */
export default createView<MyGamesState>()({
  id: 'mygames',
  idParams: [],
  events: {},
  defaultState: { kind: 'games', grouping: 'state', filter: 'all', sort: 'created', descending: true, page: 0 },
  subscribesTo: {},
  guards: { '*': [inGuild] },

  render: async (view, _db, client) => {
    const state = view.state ?? {
      kind: 'games',
      grouping: 'state',
      filter: 'all',
      sort: 'created',
      descending: true,
      page: 0,
    };
    const kibitz = state.kind === 'kibitz';
    const member = view.member!;
    const guild = BigInt(view.entityId!);

    const all = (await listGameRecordsByMember(member, guild)) as GameRecord[];
    const mine = all.filter((r) => (r.role === 'Kibitzer') === kibitz);
    const shown = sorted(
      mine.filter((r) => matches(r, state.filter)),
      state.sort,
      state.descending,
    );

    // A role's icon follows its game's script, so each game's look is its own.
    const scripts = new Map(
      await Promise.all(
        [...new Set(shown.filter((r) => r.trueRole).map((r) => r.id))].map(
          async (id) => [id, characterChoices((await getScriptSummary(id))?.json)] as const,
        ),
      ),
    );
    const lookOf = (record: GameRecord) => {
      const look = roleLook(client, guild, scripts.get(record.id));
      return {
        roleTag: (role: string, alignment: Parameters<typeof roleTag>[2]) => roleTag(role, look, alignment),
        teamOf: look.teamOf,
      };
    };

    const groups = grouped(shown, kibitz ? null : state.grouping).map((group) => ({
      title: group.title,
      blocks: group.records.map((record) => recordLines(record, lookOf(record)).join('\n')),
    }));
    const pages = paginate(groups, PAGE_BUDGET);
    const page = Math.min(state.page, Math.max(0, pages.length - 1));

    const signups = kibitz ? [] : (await listSignupsByMemberInGuild(member, guild)).filter((s) => s.accepted !== false);

    const body: ContainerChild[] = [];
    if (signups.length > 0) {
      body.push(
        text(
          [
            '## Signups',
            ...signups.map(
              (s) => `- **${s.entryTitle}** · ${s.queueName} · ${s.accepted ? 'accepted' : 'pending'} as a ${s.role}`,
            ),
          ].join('\n'),
        ),
      );
    }
    if (pages.length === 0) {
      body.push(text(mine.length === 0 ? (kibitz ? S.my.noKibitzes : S.my.noGames) : S.my.nothingMatches));
    } else {
      for (const section of pages[page]!) {
        body.push(text([...(section.title ? [`## ${section.title}`] : []), ...section.blocks].join('\n\n')));
      }
    }

    return {
      ...v2(
        linear(
          text(
            `### ${kibitz ? 'Your kibitzes' : 'Your games'}${pages.length > 1 ? `\n-# Page ${page + 1} of ${pages.length}` : ''}`,
          ),
          ...body,
          separator(),
          ...(kibitz
            ? []
            : [
                selectRow(
                  select(view.customId('group'), 'Group by').addOptions(
                    option(GROUPING_LABEL, GROUPINGS, state.grouping),
                  ),
                ),
              ]),
          selectRow(
            select(view.customId('filter'), 'Filter').addOptions(
              option(FILTER_LABEL, kibitz ? STATE_FILTERS : FILTERS, state.filter),
            ),
          ),
          selectRow(select(view.customId('sort'), 'Sort by').addOptions(option(SORT_LABEL, SORTS, state.sort))),
          buttonRow(
            button(view.customId('direction'), state.descending ? 'Descending' : 'Ascending', ButtonStyle.Secondary),
            button(view.customId('prev'), '◀', ButtonStyle.Secondary).setDisabled(page === 0),
            button(view.customId('next'), `▶`, ButtonStyle.Secondary).setDisabled(page >= pages.length - 1),
            dismiss.button(view),
          ),
        ).setAccentColor(accent.brand),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...dismiss.interactions,

    group: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      const grouping = interaction.values[0];
      if (parse.grouping(grouping)) await ctx.updateState({ grouping, page: 0 });
      return { action: 'render' };
    },

    filter: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      const filter = interaction.values[0];
      if (parse.filter(filter)) await ctx.updateState({ filter, page: 0 });
      return { action: 'render' };
    },

    sort: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      const sort = interaction.values[0];
      if (parse.sort(sort)) await ctx.updateState({ sort, page: 0 });
      return { action: 'render' };
    },

    direction: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ descending: !(ctx.view.state?.descending ?? true), page: 0 });
      return { action: 'render' };
    },

    prev: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ page: Math.max(0, (ctx.view.state?.page ?? 0) - 1) });
      return { action: 'render' };
    },

    next: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ page: (ctx.view.state?.page ?? 0) + 1 });
      return { action: 'render' };
    },
  },
});
