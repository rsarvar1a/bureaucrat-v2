import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage, destroyView } from '../../../../engine/discord/views/lifecycle';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getQueue } from '../../../../drizzle/queues';
import { getQueueEntry } from '../../../../drizzle/queue-entries';
import { inGuild } from '../../guards';
import { canManageEntry } from '../../guards/queue';
import { claimEntry, slotAvailable } from '../../games/claim';
import { offerVacancy } from '../../games/vacancy';
import { QueueEvents, QueueEntryEvents, queueEvents, queueEntryEvents } from './events';

type OfferState = {
  queue: string;
  // Entries that passed on this vacancy, so the next offer skips them.
  passed: string[];
};

// A public card in the entries thread: a slot opened and the Storyteller at
// the front of the queue is asked first. entityId is the entry, so the same
// guard that protects the entry's own pane decides who may answer.
export default createView<OfferState>()({
  id: 'qoffer',
  idParams: [],
  events: {},
  defaultState: { queue: '', passed: [] },
  // `${qentry}` is supplied as a caller id at spawn, since nothing in this
  // card's ancestry has that route.
  subscribesTo: { destroy: [QueueEvents.Destroyed, QueueEntryEvents.Destroyed] },
  guards: { '*': [inGuild], claim: [canManageEntry], pass: [canManageEntry] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const entry = await getQueueEntry(view.entityId!);
    const queue = await getQueue(view.state.queue);
    if (!entry || !queue) return v2(linear(text('This offer has lapsed.')).setAccentColor(accent.neutral));

    return v2(
      linear(
        text(`### A slot opened in ${queue.name}`),
        text(`<@${entry.storyteller}>, you're up next with ${entry.title}!`),
        separator(),
        buttonRow(
          button(view.customId('claim'), 'Claim', ButtonStyle.Success),
          button(view.customId('pass'), 'Pass', ButtonStyle.Secondary),
        ),
      ).setAccentColor(accent.brand),
    );
  },

  interactions: {
    claim: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const entry = await getQueueEntry(ctx.view.entityId!);
      const queue = entry ? await getQueue(entry.queue) : undefined;
      if (!entry || !queue) return { action: 'destroy' };

      const slot = await slotAvailable(queue);
      if (!slot.ok) {
        await toast.ephemeral(interaction, `No slot is free: ${slot.active} of ${queue.concurrency} running.`, {
          accent: accent.warning,
        });
        return { action: 'destroy' };
      }

      const created = await claimEntry({ interaction }, queue, entry);

      // Concrete labels: this card's ancestry has the queue but not the entry's route.
      await ctx.notifyAll(queueEvents(queue.id).EntriesChanged, queueEntryEvents(entry.id).Destroyed);
      await toast.ephemeral(interaction, `**${entry.title}** is ready to go in ${created.channel}.`, {
        accent: accent.success,
        timeoutMs: 15_000,
      });

      return { action: 'destroy' };
    },

    pass: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const { queue, passed } = ctx.view.state;
      const entryId = ctx.view.entityId!;

      await deleteViewMessage(ctx.view, interaction.client);
      await destroyView(ctx.view.id);

      await offerVacancy(ctx.spawnView, { interaction }, queue, [...passed, entryId]);
    },
  },
});
