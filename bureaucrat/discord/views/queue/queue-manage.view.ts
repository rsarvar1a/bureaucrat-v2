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
import { confirmButton, type ConfirmState } from '../components/confirm';

import { getQueue, updateQueue } from '../../../drizzle/queues';
import { safeParseInt } from '../../../utilities/parse-int';
import { modal, field } from '../components/modal';
import { QueueEvents } from './events';

type ManageState = ConfirmState<'delete'>;

const dismiss = dismissButton<ManageState>()({ action: 'dismiss' });

const manageModal = modal<ManageState>()({
  action: 'manage',
  title: 'Manage Queue',
  fields: {
    name: field.short('Queue Name', { maxLength: 100 }),
    description: field.paragraph('Description', { required: false, maxLength: 1000 }),
    concurrency: field.short('Concurrency', { required: false }),
    entriesPerStoryteller: field.short('Entries per Storyteller', { required: false }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const description = values['description'] || null;
    const concurrency = safeParseInt(values['concurrency']!);
    const entriesPerStoryteller = safeParseInt(values['entriesPerStoryteller']!);

    await updateQueue(ctx.view.entityId!, {
      name: values['name']!,
      description,
      concurrency,
      entriesPerStoryteller,
    });

    await ctx.notifyAll(QueueEvents.EntriesChanged);

    await interaction.deleteReply();
  },
});

const del = confirmButton<ManageState>()({
  action: 'delete',
  label: 'Delete',
  onConfirm: async (ctx, interaction) => {
    await ctx.notifyAll(QueueEvents.Destroyed);
    await interaction.deleteReply();
  },
});

export default createView<ManageState>()({
  id: 'queuemanage',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { destroy: [QueueEvents.Destroyed] },

  render: async (view) => {
    const queue = await getQueue(view.entityId!);
    const name = queue?.name ?? 'Unknown';

    if (del.isConfirming(view)) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Are you sure you want to delete **${name}**? This will remove the queue, all entries, and all signups. This cannot be undone.`,
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(del.confirmRow(view));

      return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      };
    }

    const lines = [`### Manage Queue: ${name}`];
    if (queue?.description) lines.push(queue.description);

    const details: string[] = [];
    if (queue?.concurrency != null) details.push(`**Concurrency:** ${queue.concurrency}`);
    if (queue?.entriesPerStoryteller != null) details.push(`**Entries per ST:** ${queue.entriesPerStoryteller}`);
    if (details.length > 0) lines.push(details.join(' · '));

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(view.customId('edit')).setLabel('Edit').setStyle(ButtonStyle.Primary),
          del.button(view),
          dismiss.button(view),
        ),
      );

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    ...dismiss.interactions,
    ...del.interactions,
    ...manageModal.interactions,

    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const queue = await getQueue(ctx.view.entityId!);
      if (!queue) return;

      await manageModal.show(interaction, ctx, {
        values: {
          name: queue.name,
          description: queue.description ?? '',
          concurrency: queue.concurrency?.toString() ?? '',
          entriesPerStoryteller: queue.entriesPerStoryteller?.toString() ?? '',
        },
      });
    },
  },
});
