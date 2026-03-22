import { ButtonStyle, MessageFlags, type TextBasedChannel } from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { deleteViewMessage } from '../../frameworks/views/lifecycle';
import { text, separator, linear, buttonRow, button, v2 } from '../../elements';

import { getQueue, deleteQueue } from '../../../drizzle/queues';
import { insertQueueEntry, listQueueEntries } from '../../../drizzle/queue-entries';
import { ensureEntryThread } from './thread';
import { ensureEntrySlotAvailable } from './guards';
import { QueueEvents } from './events';
import { modal, field } from '../components/modal';
import { tryDeleteReply } from '../../../utilities/reply';

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

    if (!(await ensureEntrySlotAvailable(interaction, ctx.view.entityId!, BigInt(interaction.user.id)))) return;

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
      { interaction, channel: thread as TextBasedChannel },
      {
        entityId: entry.id,
      },
    );

    await ctx.notifyAll(QueueEvents.EntriesChanged);

    await tryDeleteReply(interaction);
  },
});

export default createView<QueueState, typeof QueueEvents>()({
  id: 'queue',
  idParams: [],
  events: QueueEvents,
  defaultState: { threadId: null },
  subscribesTo: { render: [QueueEvents.EntriesChanged], destroy: [QueueEvents.Destroyed] },

  destroy: async (view, client) => {
    if (view.state.threadId) {
      try {
        const thread = await client.channels.fetch(view.state.threadId);
        if (thread) await thread.delete();
      } catch {
        // Thread may already be deleted
      }
    }
    await deleteViewMessage(view, client);
    await deleteQueue(view.entityId!);
  },

  render: async (view) => {
    const queue = await getQueue(view.entityId!);
    if (!queue) {
      return v2(linear(text('Queue not found.')));
    }

    const entries = await listQueueEntries(queue.id);

    const now = new Date();
    const ready = entries.filter((e) => !e.minimumStartDate || e.minimumStartDate <= now);
    const waiting = entries.filter((e) => e.minimumStartDate && e.minimumStartDate > now);

    const readyText =
      ready.length === 0 && waiting.length === 0
        ? '*No entries yet. Click "Enter" to sign up as a Storyteller.*'
        : ready.length === 0
          ? '*No entries ready.*'
          : ready.map((e, i) => `${i + 1}. **${e.title}** by <@${e.storyteller}>`).join('\n');

    const waitingSection =
      waiting.length > 0
        ? [
            separator(),
            text('**Waiting**'),
            text(
              waiting
                .map(
                  (e) =>
                    `- <t:${Math.floor(e.minimumStartDate!.getTime() / 1000)}:R> **${e.title}** by <@${e.storyteller}>`,
                )
                .join('\n'),
            ),
          ]
        : [];

    const c = linear(
      text(`### ${queue.name}`),
      separator(),
      ...(queue.description ? [text(queue.description), separator()] : []),
      text(readyText),
      ...waitingSection,
      separator(),
      buttonRow(
        button(view.customId('enter'), 'Enter', ButtonStyle.Primary),
        button(view.customId('manage'), 'Manage Queue', ButtonStyle.Secondary),
      ),
    ).setAccentColor(0x5865f2);

    return v2(c);
  },

  interactions: {
    enter: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      if (!(await ensureEntrySlotAvailable(interaction, ctx.view.entityId!, BigInt(interaction.user.id)))) return;

      await enterModal.show(interaction, ctx);
    },

    ...enterModal.interactions,

    manage: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      await ctx.spawnView('queuemanage', { interaction }, { visibility: 'ephemeral' });
    },
  },
});
