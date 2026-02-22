import { and, eq, sql } from 'drizzle-orm';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { createView } from '../frameworks/views/create-view';
import { buildCustomId } from '../frameworks/views/custom-id';
import type { ViewRow } from '../frameworks/views/types';
import type { Postgres } from '../../utilities/db';
import { db } from '../../utilities/db';
import { View } from '../../schema/abc/views.sql';

type ListState = {
  nextIndex: number;
};

export const ListEvents = {
  ItemChanged: 'list::${list}::items',
  ItemCompleted: 'li::${li}::completed',
} as const;

export default createView<ListState, typeof ListEvents>({
  id: 'list',
  idParams: [],
  events: ListEvents,
  defaultState: { nextIndex: 1 },
  subscribesTo: ['ItemChanged'],

  render: async (view: ViewRow<ListState>, db: Postgres) => {
    const items = await db
      .select()
      .from(View)
      .where(and(eq(View.route, 'li'), eq(View.entityId, view.id)));

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('### List'))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (items.length === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('*No items yet. Click "Add Item" to create one.*'),
      );
    } else {
      const lines = items.map((item) => {
        const state = item.state as { description: string; completed?: boolean } | null;
        const desc = state?.description ?? 'Untitled';
        return state?.completed ? `- ~~${desc}~~` : `- ${desc}`;
      });
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    }

    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::list', 'add', view.id))
            .setLabel('Add Item')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::list', 'complete', view.id))
            .setLabel('Complete')
            .setStyle(ButtonStyle.Success),
        ),
      )
      .setAccentColor(0x57f287);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    add: async (interaction, ctx) => {
      await interaction.deferUpdate();

      const currentIndex = ctx.view.state?.nextIndex ?? 1;
      await ctx.updateState({ nextIndex: currentIndex + 1 });

      const listId = ctx.ids['list']!;
      await ctx.spawnView(
        'li',
        { interaction, messageId: String(ctx.view.message) },
        {
          ids: { list: listId },
          entityId: listId,
          state: { description: `Item ${currentIndex}` },
        },
      );

      return { action: 'rerender' };
    },

    complete: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const listId = ctx.ids['list']!;
      const items = await db
        .select()
        .from(View)
        .where(
          and(
            eq(View.route, 'li'),
            eq(View.entityId, listId),
            sql`(${View.state}->>'completed' IS NULL OR ${View.state}->>'completed' = 'false')`,
          ),
        );

      if (items.length === 0) {
        await interaction.reply({
          content: 'All items are already complete!',
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(buildCustomId('view::list', 'complete-ok', ctx.view.id))
        .setPlaceholder('Select an item to complete')
        .addOptions(
          items.map((item) => {
            const state = item.state as { description: string } | null;
            return {
              label: state?.description ?? 'Untitled',
              value: item.id,
            };
          }),
        );

      await interaction.reply({
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
        flags: [MessageFlags.Ephemeral],
      });
    },

    'complete-ok': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;

      await interaction.deferUpdate();
      const selectedItemId = interaction.values[0]!;

      await db
        .update(View)
        .set({ state: sql`${View.state} || '{"completed":true}'::jsonb` })
        .where(eq(View.id, selectedItemId));

      await ctx.notifyAll(ListEvents.ItemChanged);
      await ctx.notify(`li::${selectedItemId}::completed`);

      await interaction.editReply({ content: 'Item marked as complete!', components: [] });
    },
  },
});
