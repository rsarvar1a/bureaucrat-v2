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

import { getQueueEntry } from '../../../drizzle/queue-entries';
import { listAcceptedSignups, getSignupByMemberAndEntry } from '../../../drizzle/queue-entry-signups';
import { QueueEntryEvents } from './events';

type QueueEntryState = Record<string, never>;

export default createView<QueueEntryState, typeof QueueEntryEvents>()({
  id: 'qentry',
  idParams: [],
  events: QueueEntryEvents,
  defaultState: {},
  subscribesTo: ['SignupsChanged'],

  render: async (view) => {
    const entry = await getQueueEntry(view.entityId!);
    if (!entry) {
      return {
        components: [
          new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Entry not found.')),
        ],
        flags: MessageFlags.IsComponentsV2,
      };
    }

    const signups = await listAcceptedSignups(entry.id);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${entry.title}\n<@${entry.storyteller}>`))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (entry.description) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(entry.description));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    }

    if (entry.minimumStartDate) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Earliest start: <t:${Math.floor(entry.minimumStartDate.getTime() / 1000)}:R>`,
        ),
      );
    }

    if (signups.length > 0) {
      const roleGroups: Record<string, string[]> = {};
      for (const s of signups) {
        const role = s.role;
        if (!roleGroups[role]) roleGroups[role] = [];
        roleGroups[role]!.push(`<@${s.member}>`);
      }

      const lines = Object.entries(roleGroups).map(
        ([role, members]) => `**${role}s:**\n${members.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
      );
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n\n')));
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('*No signups yet.*'));
    }

    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(view.customId('signup')).setLabel('Signup').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(view.customId('manage')).setLabel('Manage').setStyle(ButtonStyle.Secondary),
        ),
      )
      .setAccentColor(0x57f287);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
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
            entryId: entry.id,
            queueId: entry.queue,
          },
        },
      );
    },

    manage: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const entry = await getQueueEntry(ctx.view.entityId!);
      if (!entry) return;

      if (BigInt(interaction.user.id) !== entry.storyteller) {
        await interaction.reply({
          content: 'Only the Storyteller who created this entry can manage it.',
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await ctx.spawnView(
        'qmanage',
        { interaction },
        {
          visibility: 'ephemeral',
          state: {
            entryId: entry.id,
            queueId: entry.queue,
          },
        },
      );
    },
  },
});
