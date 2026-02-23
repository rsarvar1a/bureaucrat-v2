import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { buildCustomId } from '../../frameworks/views/custom-id';
import { dismissButton } from '../components/dismiss';
import type { ViewRow } from '../../frameworks/views/types';
import { getQueueEntry, updateQueueEntry } from '../../../drizzle/queue-entries';
import { QueueEvents, QueueEntryEvents } from './events';

type ConfigState = {
  entryId: string;
  queueId: string;
};

const dismiss = dismissButton<ConfigState>();

export default createView<ConfigState>({
  id: 'qconfig',
  idParams: [],
  events: {},
  defaultState: { entryId: '', queueId: '' },
  subscribesTo: [],

  render: async (view: ViewRow<ConfigState>) => {
    const entry = await getQueueEntry(view.state.entryId);

    const title = entry?.title ?? 'Unknown';
    const description = entry?.description
      ? entry.description.length > 200
        ? entry.description.slice(0, 200) + '…'
        : entry.description
      : '*No description*';
    const visibility = entry?.public ? 'Public' : 'Private';
    const startDate = entry?.minimumStartDate ? `<t:${Math.floor(entry.minimumStartDate.getTime() / 1000)}:D>` : 'None';

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Configure: ${title}`))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${description}\n\n**Visibility:** ${visibility}\n**Minimum Start Date:** ${startDate}`,
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::qconfig', 'edit', view.id))
            .setLabel('Edit')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::qconfig', 'toggle-public', view.id))
            .setLabel(entry?.public ? 'Make Private' : 'Make Public')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .addActionRowComponents(dismiss.row(view));

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    ...dismiss.interactions,

    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const entry = await getQueueEntry(ctx.view.state!.entryId);
      if (!entry) return;

      const modal = new ModalBuilder()
        .setCustomId(buildCustomId('view::qconfig', 'edit-submit', ctx.view.id))
        .setTitle('Edit Entry')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('Title')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(entry.title)
              .setMaxLength(100),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Description')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setValue(entry.description)
              .setMaxLength(1000),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('minimumStartDate')
              .setLabel('Minimum Start Date (YYYY-MM-DD)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(entry.minimumStartDate ? entry.minimumStartDate.toISOString().split('T')[0]! : ''),
          ),
        );

      await interaction.showModal(modal);
    },

    'edit-submit': async (interaction, ctx) => {
      if (!interaction.isModalSubmit()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const dateStr = interaction.fields.getTextInputValue('minimumStartDate');
      const minimumStartDate = dateStr ? new Date(dateStr) : undefined;

      await updateQueueEntry(state.entryId, { title, description, minimumStartDate });

      ctx.ids['qid'] = state.queueId;
      ctx.ids['qeid'] = state.entryId;
      await ctx.notify(QueueEvents.EntriesChanged, QueueEntryEvents.SignupsChanged);

      return { action: 'rerender' };
    },

    'toggle-public': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      const entry = await getQueueEntry(state.entryId);
      if (!entry) return;

      await updateQueueEntry(state.entryId, { public: !entry.public });

      ctx.ids['qeid'] = state.entryId;
      ctx.ids['qid'] = state.queueId;
      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'rerender' };
    },
  },
});
