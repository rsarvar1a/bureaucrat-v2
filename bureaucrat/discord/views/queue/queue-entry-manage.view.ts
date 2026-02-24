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
import { eq, and } from 'drizzle-orm';
import { createView } from '../../frameworks/views/create-view';
import { destroyView } from '../../frameworks/views/lifecycle';
import { dismissButton } from '../components/dismiss';
import { confirmButton } from '../components/confirm';

import { db } from '../../../utilities/db';
import { View } from '../../../schema/abc/views.sql';
import { getQueueEntry, deleteQueueEntry } from '../../../drizzle/queue-entries';
import { listSignups } from '../../../drizzle/queue-entry-signups';
import { QueueEvents } from './events';

type ManageState = {
  entryId: string;
  queueId: string;
  confirming?: boolean;
};

const dismiss = dismissButton<ManageState>()({ action: 'dismiss' });

const del = confirmButton<ManageState>()({
  action: 'delete',
  label: 'Delete',
  onConfirm: async (ctx, interaction) => {
    const state = ctx.view.state!;

    // Find and destroy the QueueEntry view in the thread
    const [entryView] = await db
      .select()
      .from(View)
      .where(and(eq(View.route, 'qentry'), eq(View.entityId, state.entryId)));

    if (entryView) {
      try {
        const channel = await interaction.client.channels.fetch(String(entryView.channel));
        if (channel && 'messages' in channel) {
          const message = await channel.messages.fetch(String(entryView.message));
          await message.delete();
        }
      } catch {
        // Message may already be deleted
      }
      await destroyView(entryView.id);
    }

    await deleteQueueEntry(state.entryId);

    ctx.ids['queue'] = state.queueId;
    await ctx.notify(QueueEvents.EntriesChanged);

    await destroyView(ctx.view.id);
    await interaction.deleteReply();
  },
});

export default createView<ManageState>()({
  id: 'qmanage',
  idParams: [],
  events: {},
  defaultState: { entryId: '', queueId: '' },
  subscribesTo: [],

  render: async (view) => {
    const entry = await getQueueEntry(view.state.entryId);
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

      const state = ctx.view.state!;
      await ctx.spawnView(
        'qconfig',
        { interaction },
        {
          visibility: 'ephemeral',
          state: {
            entryId: state.entryId,
            queueId: state.queueId,
          },
        },
      );
    },

    signups: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const state = ctx.view.state!;
      const signups = await listSignups(state.entryId);

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
          state: {
            selectedSignupId: null,
            entryId: state.entryId,
            queueId: state.queueId,
            memberNames,
          },
        },
      );
    },
  },
});
