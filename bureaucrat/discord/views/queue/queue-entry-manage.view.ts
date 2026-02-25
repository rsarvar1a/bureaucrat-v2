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
import { deleteViewMessage } from '../../frameworks/views/lifecycle';
import { dismissButton } from '../components/dismiss';
import { confirmButton, type ConfirmState } from '../components/confirm';

import { getQueueEntry } from '../../../drizzle/queue-entries';
import { listSignups } from '../../../drizzle/queue-entry-signups';
import { QueueEntryEvents, QueueEvents } from './events';

type ManageState = ConfirmState<'delete'>;

const dismiss = dismissButton<ManageState>()({ action: 'dismiss' });

const del = confirmButton<ManageState>()({
  action: 'delete',
  label: 'Delete',
  onConfirm: async (ctx, interaction) => {
    await ctx.notifyAll(QueueEvents.EntriesChanged, QueueEntryEvents.Destroyed);
    await interaction.deleteReply();
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
      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`Are you sure you want to delete **${title}**? This cannot be undone.`),
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(del.confirmRow(view));

      return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      };
    }

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Manage Entry: ${title}`))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(view.customId('configure'))
            .setLabel('Configure')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(view.customId('signups'))
            .setLabel('Manage Signups')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(del.button(view), dismiss.button(view)),
      );

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    ...dismiss.interactions,
    ...del.interactions,

    configure: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      await ctx.spawnView('qconfig', { interaction }, { visibility: 'ephemeral' });
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
          state: { selectedSignupId: null, memberNames },
        },
      );
    },
  },
});
