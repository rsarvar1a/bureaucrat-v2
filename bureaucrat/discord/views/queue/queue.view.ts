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
import type { ViewRow } from '../../frameworks/views/types';
import { getQueue, updateQueue } from '../../../drizzle/queues';
import { insertQueueEntry, listQueueEntries, countEntriesByStoryteller } from '../../../drizzle/queue-entries';
import { ensureEntryThread } from './thread';
import { QueueEvents } from './events';

type QueueState = {
  threadId: string | null;
};

export default createView<QueueState, typeof QueueEvents>({
  id: 'queue',
  idParams: [],
  events: QueueEvents,
  defaultState: { threadId: null },
  subscribesTo: ['EntriesChanged'],

  render: async (view: ViewRow<QueueState>) => {
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
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::queue', 'enter', view.id))
            .setLabel('Enter')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::queue', 'manage', view.id))
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

      const modal = new ModalBuilder()
        .setCustomId(buildCustomId('view::queue', 'enter-submit', ctx.view.id))
        .setTitle('Enter Queue')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('Game Title')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Description')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1000),
          ),
        );

      await interaction.showModal(modal);
    },

    'enter-submit': async (interaction, ctx) => {
      if (!interaction.isModalSubmit()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
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
        title,
        description,
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
        { interaction, channel: thread as unknown as import('discord.js').TextBasedChannel },
        {
          ids: { qeid: entry.id, qid: queue.id },
          entityId: entry.id,
        },
      );

      ctx.ids['qid'] = ctx.view.entityId!;
      await ctx.notifyAll(QueueEvents.EntriesChanged);

      await interaction.deleteReply();
    },

    manage: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const queue = await getQueue(ctx.view.entityId!);
      if (!queue) return;

      const modal = new ModalBuilder()
        .setCustomId(buildCustomId('view::queue', 'manage-submit', ctx.view.id))
        .setTitle('Manage Queue')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Queue Name')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(queue.name)
              .setMaxLength(100),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Description')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setValue(queue.description ?? '')
              .setMaxLength(1000),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('concurrency')
              .setLabel('Concurrency')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(queue.concurrency?.toString() ?? ''),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('entriesPerStoryteller')
              .setLabel('Entries per Storyteller')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(queue.entriesPerStoryteller?.toString() ?? ''),
          ),
        );

      await interaction.showModal(modal);
    },

    'manage-submit': async (interaction, ctx) => {
      if (!interaction.isModalSubmit()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const name = interaction.fields.getTextInputValue('name');
      const description = interaction.fields.getTextInputValue('description') || null;
      const concurrencyStr = interaction.fields.getTextInputValue('concurrency');
      const epsStr = interaction.fields.getTextInputValue('entriesPerStoryteller');

      const concurrency = concurrencyStr ? parseInt(concurrencyStr, 10) : null;
      const entriesPerStoryteller = epsStr ? parseInt(epsStr, 10) : null;

      await updateQueue(ctx.view.entityId!, {
        name,
        description,
        ...(concurrency !== null ? { concurrency } : {}),
        ...(entriesPerStoryteller !== null ? { entriesPerStoryteller } : {}),
      });

      ctx.ids['qid'] = ctx.view.entityId!;
      await ctx.notifyAll(QueueEvents.EntriesChanged);

      await interaction.deleteReply();
    },
  },
});
