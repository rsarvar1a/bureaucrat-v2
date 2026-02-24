import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { dismissButton } from '../components/dismiss';
import { modal, field } from '../components/modal';

import { getQueueEntry, updateQueueEntry } from '../../../drizzle/queue-entries';
import { QueueEvents, QueueEntryEvents } from './events';

type ConfigState = {
  entryId: string;
  queueId: string;
};

const dismiss = dismissButton<ConfigState>()({ action: 'dismiss' });

const editModal = modal<ConfigState>()({
  action: 'edit',
  title: 'Edit Entry',
  fields: {
    title: field.short('Title', { maxLength: 100 }),
    description: field.paragraph('Description', { maxLength: 1000 }),
    minimumStartDate: field.short('Minimum Start Date (YYYY-MM-DD)', { required: false }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const state = ctx.view.state!;
    const title = values['title']!;
    const description = values['description']!;
    const dateStr = values['minimumStartDate'];
    const minimumStartDate = dateStr ? new Date(dateStr) : null;

    await updateQueueEntry(state.entryId, { title, description, minimumStartDate });

    ctx.ids['queue'] = state.queueId;
    ctx.ids['qentry'] = state.entryId;
    await ctx.notify(QueueEvents.EntriesChanged, QueueEntryEvents.SignupsChanged);

    return { action: 'rerender' };
  },
});

export default createView<ConfigState>()({
  id: 'qconfig',
  idParams: [],
  events: {},
  defaultState: { entryId: '', queueId: '' },
  subscribesTo: [],

  render: async (view) => {
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
          new ButtonBuilder().setCustomId(view.customId('edit')).setLabel('Edit').setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(view.customId('toggle-public'))
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

      await editModal.show(interaction, ctx, {
        title: entry.title,
        description: entry.description,
        minimumStartDate: entry.minimumStartDate ? entry.minimumStartDate.toISOString().split('T')[0]! : '',
      });
    },

    ...editModal.interactions,

    'toggle-public': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      const entry = await getQueueEntry(state.entryId);
      if (!entry) return;

      await updateQueueEntry(state.entryId, { public: !entry.public });

      ctx.ids['qentry'] = state.entryId;
      ctx.ids['queue'] = state.queueId;
      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'rerender' };
    },
  },
});
