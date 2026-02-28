import { ButtonStyle } from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { deleteViewMessage } from '../../frameworks/views/lifecycle';
import { text, separator, linear, buttonRow, button, v2 } from '../../elements';
import { toast } from '../../../utilities/reply';

import { deleteQueueEntry, getQueueEntry } from '../../../drizzle/queue-entries';
import { listAcceptedSignups, getSignupByMemberAndEntry } from '../../../drizzle/queue-entry-signups';
import { QueueEvents, QueueEntryEvents } from './events';

type QueueEntryState = Record<string, never>;

export default createView<QueueEntryState, typeof QueueEntryEvents>()({
  id: 'qentry',
  idParams: [],
  events: QueueEntryEvents,
  defaultState: {},
  subscribesTo: {
    render: [QueueEntryEvents.SignupsChanged],
    destroy: [QueueEvents.Destroyed, QueueEntryEvents.Destroyed],
  },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
    await deleteQueueEntry(view.entityId!);
  },

  render: async (view) => {
    const entry = await getQueueEntry(view.entityId!);
    if (!entry) {
      return v2(linear(text('Entry not found.')));
    }

    const signups = await listAcceptedSignups(entry.id);

    let signupText: string;
    if (signups.length > 0) {
      const roleGroups: Record<string, string[]> = {};
      for (const s of signups) {
        const role = s.role;
        if (!roleGroups[role]) roleGroups[role] = [];
        roleGroups[role]!.push(`<@${s.member}>`);
      }
      signupText = Object.entries(roleGroups)
        .map(([role, members]) => `**${role}s:**\n${members.map((m, i) => `${i + 1}. ${m}`).join('\n')}`)
        .join('\n\n');
    } else {
      signupText = '*No signups yet.*';
    }

    const c = linear(
      text(`### ${entry.title}\n<@${entry.storyteller}>`),
      separator(),
      ...(entry.description ? [text(entry.description), separator()] : []),
      ...(entry.minimumStartDate
        ? [text(`Earliest start: <t:${Math.floor(entry.minimumStartDate.getTime() / 1000)}:R>`)]
        : []),
      text(signupText),
      separator(),
      buttonRow(
        button(view.customId('signup'), 'Signup', ButtonStyle.Primary),
        button(view.customId('manage'), 'Manage', ButtonStyle.Secondary),
      ),
    ).setAccentColor(0x57f287);

    return v2(c);
  },

  interactions: {
    signup: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const entry = await getQueueEntry(ctx.view.entityId!);
      if (!entry) return;

      const existing = await getSignupByMemberAndEntry(BigInt(interaction.user.id), entry.id);

      await ctx.spawnView(
        'qsignup',
        { interaction },
        {
          visibility: 'ephemeral',
          state: {
            mode: existing ? 'existing' : 'new',
            signupId: existing?.id ?? null,
          },
        },
      );
    },

    manage: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const entry = await getQueueEntry(ctx.view.entityId!);
      if (!entry) return;

      if (BigInt(interaction.user.id) !== entry.storyteller) {
        await toast.ephemeral(interaction, 'Only the Storyteller who created this entry can manage it.');
        return;
      }

      await ctx.spawnView('qmanage', { interaction }, { visibility: 'ephemeral' });
    },
  },
});
