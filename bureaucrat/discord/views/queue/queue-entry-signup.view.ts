import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { buildCustomId } from '../../frameworks/views/custom-id';
import { destroyView } from '../../frameworks/views/lifecycle';
import { dismissButton } from '../components/dismiss';
import type { ViewRow } from '../../frameworks/views/types';
import { getQueueEntry } from '../../../drizzle/queue-entries';
import { insertSignup, updateSignup, deleteSignup } from '../../../drizzle/queue-entry-signups';
import { QueueEntryEvents } from './events';

type SignupState = {
  mode: 'new' | 'existing';
  signupId: string | null;
  entryId: string;
  queueId: string;
  selectedRole?: 'Player' | 'Storyteller' | 'Kibitzer';
};

const dismiss = dismissButton<SignupState>();

export default createView<SignupState>({
  id: 'qsignup',
  idParams: [],
  events: {},
  defaultState: { mode: 'new', signupId: null, entryId: '', queueId: '' },
  subscribesTo: [],

  render: async (view: ViewRow<SignupState>) => {
    const state = view.state;

    if (state.mode === 'existing' && state.signupId) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Your Signup'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('You already have a signup for this entry.'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(buildCustomId('view::qsignup', 'edit', view.id))
              .setLabel('Edit')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(buildCustomId('view::qsignup', 'delete', view.id))
              .setLabel('Delete')
              .setStyle(ButtonStyle.Danger),
          ),
        )
        .addActionRowComponents(dismiss.row(view));

      return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      };
    }

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Sign Up'))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('Select a role to sign up for this game.'))
      .addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(buildCustomId('view::qsignup', 'role-select', view.id))
            .setPlaceholder('Select a role')
            .addOptions(
              { label: 'Player', value: 'Player', description: 'Play in the game' },
              { label: 'Storyteller', value: 'Storyteller', description: 'Co-Storytell the game' },
              { label: 'Kibitzer', value: 'Kibitzer', description: 'Spectate the game' },
            ),
        ),
      )
      .addActionRowComponents(dismiss.row(view));

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    ...dismiss.interactions,

    'role-select': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;

      const role = interaction.values[0] as 'Player' | 'Storyteller' | 'Kibitzer';
      await ctx.updateState({ selectedRole: role });

      const modal = new ModalBuilder()
        .setCustomId(buildCustomId('view::qsignup', 'message-submit', ctx.view.id))
        .setTitle(`Sign Up as ${role}`)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('message')
              .setLabel('Message (optional)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500),
          ),
        );

      await interaction.showModal(modal);
    },

    'message-submit': async (interaction, ctx) => {
      if (!interaction.isModalSubmit()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      const message = interaction.fields.getTextInputValue('message') || undefined;
      const entry = await getQueueEntry(state.entryId);
      if (!entry) return;

      const accepted = entry.public && state.selectedRole !== 'Storyteller';

      await insertSignup({
        member: BigInt(interaction.user.id),
        entry: state.entryId,
        role: state.selectedRole!,
        message,
        accepted,
      });

      ctx.ids['qeid'] = state.entryId;
      ctx.ids['qid'] = state.queueId;
      await ctx.notify(QueueEntryEvents.SignupsChanged);

      await destroyView(ctx.view.id);
      await interaction.deleteReply();
    },

    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const modal = new ModalBuilder()
        .setCustomId(buildCustomId('view::qsignup', 'edit-submit', ctx.view.id))
        .setTitle('Edit Signup')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('message')
              .setLabel('Message (optional)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500),
          ),
        );

      await interaction.showModal(modal);
    },

    'edit-submit': async (interaction, ctx) => {
      if (!interaction.isModalSubmit()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const state = ctx.view.state!;
      if (!state.signupId) return;

      const message = interaction.fields.getTextInputValue('message') || undefined;
      await updateSignup(state.signupId, { message });

      ctx.ids['qeid'] = state.entryId;
      ctx.ids['qid'] = state.queueId;
      await ctx.notify(QueueEntryEvents.SignupsChanged);

      await interaction.deleteReply();
    },

    delete: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      if (!state.signupId) return;

      await deleteSignup(state.signupId);

      ctx.ids['qeid'] = state.entryId;
      ctx.ids['qid'] = state.queueId;
      await ctx.notify(QueueEntryEvents.SignupsChanged);

      await interaction.deleteReply();
    },
  },
});
