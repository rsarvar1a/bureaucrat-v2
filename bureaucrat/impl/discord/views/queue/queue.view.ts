import { ButtonStyle, MessageFlags, type TextBasedChannel } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';

import { getQueue, deleteQueue } from '../../../../drizzle/queues';
import { claimEntry, slotAvailable } from '../../games/claim';
import { nextClaimant } from '../../games/vacancy';
import { Permissions } from '../../../acl/permissions';
import { can, inGuild } from '../../guards';
import { frontOfQueue, queueFromEntity } from '../../guards/queue';
import { insertQueueEntry, listQueueEntries, listQueueEntryCards } from '../../../../drizzle/queue-entries';
import { ensureEntryThread } from './thread';
import { fitPreviews, preview } from './preview';
import { ensureEntrySlotAvailable } from './guards';
import { QueueEvents, queueEntryEvents } from './events';
import { modal, field } from '../../../../engine/discord/components/modal';
import { toast, tryDeleteReply } from '../../../../engine/discord/reply';

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
  guards: { '*': [inGuild], manage: [can(Permissions.Queue.Edit, queueFromEntity)], claim: [frontOfQueue] },

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

    const [entries, cards] = await Promise.all([listQueueEntries(queue.id), listQueueEntryCards(queue.id)]);

    // The title jumps to the entry's own card in the entries thread when it has one.
    const title = (e: (typeof entries)[number]) => {
      const card = cards.get(e.id);
      return card
        ? `**[${e.title}](https://discord.com/channels/${queue.guild}/${card.channel}/${card.message})**`
        : `**${e.title}**`;
    };

    const now = new Date();
    const ready = entries.filter((e) => !e.minimumStartDate || e.minimumStartDate <= now);
    const waiting = entries.filter((e) => e.minimumStartDate && e.minimumStartDate > now);

    // One line per entry, and the first of its description beneath at the given preview length.
    const line = (head: string, e: (typeof entries)[number], length: number) => {
      const quoted = preview(e.description, length);
      return quoted ? `${head}\n${quoted}` : head;
    };
    const lists = (length: number) => ({
      ready:
        ready.length === 0 && waiting.length === 0
          ? '*No entries yet. Click "Enter" to sign up as a Storyteller.*'
          : ready.length === 0
            ? '*No entries ready.*'
            : ready.map((e, i) => line(`${i + 1}. ${title(e)} by <@${e.storyteller}>`, e, length)).join('\n'),
      waiting: waiting
        .map((e) =>
          line(
            `- <t:${Math.floor(e.minimumStartDate!.getTime() / 1000)}:R> ${title(e)} by <@${e.storyteller}>`,
            e,
            length,
          ),
        )
        .join('\n'),
    });

    // Previews shrink as the queue grows: the longest rung the whole card still fits at.
    const fixed = queue.name.length + 4 + (queue.description?.length ?? 0) + 12;
    const length = queue.entryPreviews
      ? fitPreviews((n) => {
          const at = lists(n);
          return fixed + at.ready.length + at.waiting.length;
        })
      : 0;
    const { ready: readyText, waiting: waitingText } = lists(length);

    const waitingSection = waiting.length > 0 ? [separator(), text('**Waiting**'), text(waitingText)] : [];

    const c = linear(
      text(`### ${queue.name}`),
      separator(),
      ...(queue.description ? [text(queue.description), separator()] : []),
      text(readyText),
      ...waitingSection,
      separator(),
      buttonRow(
        button(view.customId('enter'), 'Join Queue', ButtonStyle.Primary),
        button(view.customId('claim'), 'Claim Slot', ButtonStyle.Success).setDisabled(ready.length === 0),
        button(view.customId('manage'), 'Manage Queue', ButtonStyle.Secondary),
      ),
    ).setAccentColor(accent.brand);

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

    // The guard has already said the presser owns the front entry; that entry
    // is the one consumed, and any others they hold stay in the queue.
    claim: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const queue = await getQueue(ctx.view.entityId!);
      const entry = queue ? nextClaimant(await listQueueEntries(queue.id), [], new Date()) : null;
      if (!queue || !entry) return;

      const slot = await slotAvailable(queue);
      if (!slot.ok) {
        await toast.ephemeral(interaction, `No slot is free: ${slot.active} of ${queue.concurrency} running.`, {
          accent: accent.warning,
        });
        return;
      }

      const created = await claimEntry({ interaction }, queue, entry);

      await ctx.notifyAll(QueueEvents.EntriesChanged, queueEntryEvents(entry.id).Destroyed);
      await toast.ephemeral(interaction, `**${entry.title}** is on. Your threads are in ${created.channel}.`, {
        accent: accent.success,
        timeoutMs: 15_000,
      });
    },
  },
});
