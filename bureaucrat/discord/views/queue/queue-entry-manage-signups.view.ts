import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { deleteViewMessage } from '../../frameworks/views/lifecycle';
import { dismissButton } from '../components/dismiss';

import { listSignups, updateSignup, deleteSignup } from '../../../drizzle/queue-entry-signups';
import { QueueEvents, QueueEntryEvents } from './events';

type ManageSignupsState = {
  selectedSignupId: string | null;
  memberNames: Record<string, string>;
};

const dismiss = dismissButton<ManageSignupsState>()({ action: 'dismiss' });

export default createView<ManageSignupsState>()({
  id: 'qmsignups',
  idParams: [],
  events: {},
  defaultState: { selectedSignupId: null, memberNames: {} },
  subscribesTo: { destroy: [QueueEvents.Destroyed, QueueEntryEvents.Destroyed] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const state = view.state;
    const signups = await listSignups(view.entityId!);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Manage Signups'))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (signups.length === 0) {
      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('*No signups yet.*'))
        .addActionRowComponents(dismiss.row(view));

      return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      };
    }

    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(view.customId('select'))
          .setPlaceholder('Select a signup to manage')
          .addOptions(
            signups.map((s) => ({
              label: `${state.memberNames[String(s.member)] ?? String(s.member)} — ${s.role}`,
              description: s.accepted ? 'Accepted' : 'Pending',
              value: s.id,
              default: s.id === state.selectedSignupId,
            })),
          ),
      ),
    );

    if (state.selectedSignupId) {
      const selected = signups.find((s) => s.id === state.selectedSignupId);
      if (selected) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**<@${selected.member}>** — ${selected.role} — ${selected.accepted ? 'Accepted' : 'Pending'}${selected.message ? `\n> ${selected.message}` : ''}`,
          ),
        );
      }

      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(view.customId('accept')).setLabel('Accept').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(view.customId('decline')).setLabel('Decline').setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(view.customId('reset'))
            .setLabel('Reset to Pending')
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    }

    container.addActionRowComponents(dismiss.row(view));

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    ...dismiss.interactions,

    select: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      await ctx.updateState({ selectedSignupId: interaction.values[0]! });

      return { action: 'rerender' };
    },

    accept: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      if (!state.selectedSignupId) return;

      await updateSignup(state.selectedSignupId, { accepted: true });

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'rerender' };
    },

    decline: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      if (!state.selectedSignupId) return;

      await deleteSignup(state.selectedSignupId);
      await ctx.updateState({ selectedSignupId: null });

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'rerender' };
    },

    reset: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      if (!state.selectedSignupId) return;

      await updateSignup(state.selectedSignupId, { accepted: false });

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'rerender' };
    },
  },
});
