import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type TextChannel,
} from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { buildCustomId } from '../../frameworks/views/custom-id';
import { destroyView } from '../../frameworks/views/lifecycle';
import { modal, field } from '../components/modal';
import type { ViewRow } from '../../frameworks/views/types';
import { ListEvents } from './list.view';

type ListItemState = {
  description: string;
  completed?: boolean;
};

const editModal = modal<ListItemState>({
  action: 'edit',
  title: 'Edit Item',
  fields: {
    description: field.short('Description'),
  },
  async onSubmit(values, _interaction, ctx) {
    await ctx.mutateAndNotify({ description: values['description']! }, ListEvents.ItemChanged);
    return { action: 'rerender' };
  },
});

export default createView<ListItemState, typeof ListEvents>({
  id: 'li',
  idParams: ['list'],
  events: ListEvents,
  defaultState: { description: 'Untitled' },
  subscribesTo: ['ItemCompleted'],

  render: async (view: ViewRow<ListItemState>) => {
    const { description, completed } = view.state ?? { description: 'Untitled' };

    const displayText = completed ? `~~${description}~~` : `**${description}**`;
    const accentColor = completed ? 0x95a5a6 : 0xfee75c;

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(displayText))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (!completed) {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::li', 'edit', view.id, view.entityId ?? ''))
            .setLabel('Edit')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::li', 'del', view.id, view.entityId ?? ''))
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger),
        ),
      );
    }

    container.setAccentColor(accentColor);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const currentDescription = ctx.view.state?.description ?? '';
      await editModal.show(interaction, ctx, { description: currentDescription });
    },

    ...editModal.interactions,

    del: async (interaction, ctx) => {
      await interaction.deferUpdate();

      // Destroy the DB row first so the ListView query won't include it
      await destroyView(ctx.view.id);

      // Notify the ListView to re-render
      await ctx.notify(ListEvents.ItemChanged);

      // Delete the Discord message
      const channel = interaction.channel as TextChannel | null;
      if (channel) {
        try {
          await channel.messages.delete(String(ctx.view.message));
        } catch {
          // Message may already be deleted
        }
      }

      return { action: 'noop' };
    },
  },
});
