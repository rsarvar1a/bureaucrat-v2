import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type TextBasedChannel,
} from 'discord.js';
import { createView } from '../../frameworks/views/create-view';

import { getQueue, updateQueue } from '../../../drizzle/queues';
import { insertQueueEntry, listQueueEntries, countEntriesByStoryteller } from '../../../drizzle/queue-entries';
import { ensureEntryThread } from './thread';
import { QueueEvents } from './events';
import { safeParseInt } from '../../../utilities/parse-int';
import { modal, field } from '../components/modal';

type QueueState = {
  threadId: string | null;
};

const enterModal = modal<QueueState>()({
  action: 'enter',
  title: 'Enter Queue',
  fields: {
    title: field.short('Game Title', { maxLength: 100 }),
    description: field.paragraph('Description', { maxLength: 1000 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const queue = await getQueue(ctx.view.entityId!);
    if (!queue) return;

    if (queue.entriesPerStoryteller !== null) {
      const existing = await countEntriesByStoryteller(queue.id, BigInt(interaction.user.id));
      if (existing >= queue.entriesPerStoryteller) {
        await interaction.editReply({
          content: `You already have ${existing} ${existing === 1 ? 'entry' : 'entries'} in this queue (limit: ${queue.entriesPerStoryteller}).`,
        });
        return;
      }
    }

    const entry = await insertQueueEntry({
      queue: queue.id,
      storyteller: BigInt(interaction.user.id),
      title: values['title']!,
      description: values['description']!,
    });

    const thread = await ensureEntryThread(
      interaction.client,
      String(ctx.view.channel),
      String(ctx.view.message),
      queue.name,
    );

    await ctx.updateState({ threadId: thread.id });

    await ctx.spawnView(
      'qentry',
      { interaction, channel: thread as unknown as TextBasedChannel },
      {
        ids: { qentry: entry.id, queue: queue.id },
        entityId: entry.id,
      },
    );

    await ctx.notifyAll(QueueEvents.EntriesChanged);

    await interaction.deleteReply();
  },
});

const manageModal = modal<QueueState>()({
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

export default createView<QueueState, typeof QueueEvents>()({
  id: 'queue',
  idParams: [],
  events: QueueEvents,
  defaultState: { threadId: null },
  subscribesTo: ['EntriesChanged'],

  render: async (view) => {
    const queue = await getQueue(view.entityId!);
    if (!queue) {
      return {
        components: [
          new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Queue not found.')),
        ],
        flags: MessageFlags.IsComponentsV2,
      };
    }

    const entries = await listQueueEntries(queue.id);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${queue.name}`))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (queue.description) {
      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(queue.description))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    }

    if (entries.length === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('*No entries yet. Click "Enter" to sign up as a Storyteller.*'),
      );
    } else {
      const lines = entries.map((e, i) => `${i + 1}. **${e.title}** — <@${e.storyteller}>`);
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    }

    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(view.customId('enter')).setLabel('Enter').setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(view.customId('manage'))
            .setLabel('Manage Queue')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .setAccentColor(0x5865f2);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    enter: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await enterModal.show(interaction, ctx);
    },

    ...enterModal.interactions,

    manage: async (interaction, ctx) => {
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

    ...manageModal.interactions,
  },
});
