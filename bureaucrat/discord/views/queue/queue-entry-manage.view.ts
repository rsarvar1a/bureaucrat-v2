import { ButtonStyle } from 'discord.js';

import { createView } from '../../frameworks/views/create-view';
import { deleteViewMessage } from '../../frameworks/views/lifecycle';
import { dismissButton } from '../components/dismiss';
import { confirmButton, type ConfirmState } from '../components/confirm';
import { text, separator, linear, buttonRow, button, v2 } from '../../elements';

import { getQueueEntry, listQueueEntries, bumpEntry } from '../../../drizzle/queue-entries';
import { listSignups } from '../../../drizzle/queue-entry-signups';
import { tryDeleteReply } from '../../../utilities/reply';
import { QueueEntryEvents, QueueEvents } from './events';

type ManageState = ConfirmState<'delete'>;

const dismiss = dismissButton<ManageState>()({ action: 'dismiss' });

const del = confirmButton<ManageState>()({
  action: 'delete',
  label: 'Delete',
  onConfirm: async (ctx, interaction) => {
    await ctx.notifyAll(QueueEvents.EntriesChanged, QueueEntryEvents.Destroyed);
    await tryDeleteReply(interaction);
  },
});

export default createView<ManageState>()({
  id: 'qmanage',
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

    if (del.isConfirming(view)) {
      return v2(
        linear(
          text(`Are you sure you want to delete **${title}**? This cannot be undone.`),
          separator(),
          del.confirmRow(view),
        ),
      );
    }

    const entries = entry ? await listQueueEntries(entry.queue) : [];
    const isLast = !entry || entries[entries.length - 1]?.id === entry.id;

    const bumpBtn = button(view.customId('bump'), 'Bump', ButtonStyle.Secondary).setDisabled(isLast);

    return v2(
      linear(
        text(`### Manage Entry: ${title}`),
        separator(),
        buttonRow(
          button(view.customId('configure'), 'Configure', ButtonStyle.Primary),
          button(view.customId('signups'), 'Manage Signups', ButtonStyle.Secondary),
          bumpBtn,
        ),
        buttonRow(del.button(view), dismiss.button(view)),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,
    ...del.interactions,

    configure: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      await ctx.spawnView('qconfig', { interaction }, { visibility: 'ephemeral' });
    },

    bump: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const entryId = ctx.ids['qentry']!;
      await bumpEntry(entryId);

      await ctx.notify(QueueEvents.EntriesChanged);

      return { action: 'render' };
    },

    signups: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const entryId = ctx.ids['qentry']!;
      const signups = await listSignups(entryId);

      const memberNames: Record<string, string> = {};
      if (interaction.guild) {
        const memberIds = [...new Set(signups.map((s) => String(s.member)))];
        const members = await Promise.allSettled(memberIds.map((id) => interaction.guild!.members.fetch(id)));
        for (const result of members) {
          if (result.status === 'fulfilled') {
            memberNames[result.value.id] = result.value.displayName;
          }
        }
      }

      await ctx.spawnView(
        'qmsignups',
        { interaction },
        {
          visibility: 'ephemeral',
          state: { selectedSignupId: null, memberNames, roleFilter: [] },
        },
      );
    },
  },
});
