import { ButtonStyle } from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { deleteViewMessage } from '../../frameworks/views/lifecycle';
import { dismissButton } from '../components/dismiss';
import { modal, field } from '../components/modal';
import { text, separator, linear, buttonRow, button, v2 } from '../../elements';

import { getQueueEntry, updateQueueEntry } from '../../../drizzle/queue-entries';
import { QueueEvents, QueueEntryEvents } from './events';

type ConfigState = Record<string, never>;

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

    const entryId = ctx.ids['qentry']!;
    const title = values['title']!;
    const description = values['description']!;
    const dateStr = values['minimumStartDate'];
    const minimumStartDate = dateStr ? new Date(dateStr) : null;

    await updateQueueEntry(entryId, { title, description, minimumStartDate });

    await ctx.notify(QueueEvents.EntriesChanged, QueueEntryEvents.SignupsChanged);

    return { action: 'render' };
  },
});

export default createView<ConfigState>()({
  id: 'qconfig',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { destroy: [QueueEvents.Destroyed, QueueEntryEvents.Destroyed] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const entry = await getQueueEntry(view.entityId!);

    const title = entry?.title ?? 'Unknown';
    const description = entry?.description
      ? entry.description.length > 200
        ? entry.description.slice(0, 200) + '…'
        : entry.description
      : '*No description*';
    const visibility = entry?.public ? 'Public' : 'Private';
    const startDate = entry?.minimumStartDate ? `<t:${Math.floor(entry.minimumStartDate.getTime() / 1000)}:D>` : 'None';

    return v2(
      linear(
        text(`### Configure: ${title}`),
        separator(),
        text(`${description}\n\n**Visibility:** ${visibility}\n**Minimum Start Date:** ${startDate}`),
        separator(),
        buttonRow(
          button(view.customId('edit'), 'Edit', ButtonStyle.Primary),
          button(view.customId('toggle-public'), entry?.public ? 'Make Private' : 'Make Public', ButtonStyle.Secondary),
        ),
        dismiss.row(view),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,

    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const entry = await getQueueEntry(ctx.ids['qentry']!);
      if (!entry) return;

      await editModal.show(interaction, ctx, {
        values: {
          title: entry.title,
          description: entry.description,
          minimumStartDate: entry.minimumStartDate ? entry.minimumStartDate.toISOString().split('T')[0]! : '',
        },
      });
    },

    ...editModal.interactions,

    'toggle-public': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const entryId = ctx.ids['qentry']!;
      const entry = await getQueueEntry(entryId);
      if (!entry) return;

      await updateQueueEntry(entryId, { public: !entry.public });

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'render' };
    },
  },
});
