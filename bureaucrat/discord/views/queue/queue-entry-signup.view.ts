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
import { destroyView } from '../../frameworks/views/lifecycle';
import { dismissButton } from '../components/dismiss';
import { modal, field } from '../components/modal';
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

const messageModal = modal<SignupState>({
  action: 'message',
  title: 'Sign Up',
  fields: {
    message: field.paragraph('Message (optional)', { required: false, maxLength: 500 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const state = ctx.view.state!;
    const message = values['message'] || undefined;
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

    ctx.ids['qentry'] = state.entryId;
    ctx.ids['queue'] = state.queueId;
    await ctx.notify(QueueEntryEvents.SignupsChanged);

    await destroyView(ctx.view.id);
    await interaction.deleteReply();
  },
});

const editSignupModal = modal<SignupState>({
  action: 'edit',
  title: 'Edit Signup',
  fields: {
    message: field.paragraph('Message (optional)', { required: false, maxLength: 500 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const state = ctx.view.state!;
    if (!state.signupId) return;

    const message = values['message'] || undefined;
    await updateSignup(state.signupId, { message });

    ctx.ids['qentry'] = state.entryId;
    ctx.ids['queue'] = state.queueId;
    await ctx.notify(QueueEntryEvents.SignupsChanged);

    await interaction.deleteReply();
  },
});

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
            new ButtonBuilder().setCustomId(view.customId('edit')).setLabel('Edit').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(view.customId('delete')).setLabel('Delete').setStyle(ButtonStyle.Danger),
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
            .setCustomId(view.customId('role-select'))
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

      await messageModal.show(interaction, ctx, { title: `Sign Up as ${role}` });
    },

    ...messageModal.interactions,

    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await editSignupModal.show(interaction, ctx);
    },

    ...editSignupModal.interactions,

    delete: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      if (!state.signupId) return;

      await deleteSignup(state.signupId);

      ctx.ids['qentry'] = state.entryId;
      ctx.ids['queue'] = state.queueId;
      await ctx.notify(QueueEntryEvents.SignupsChanged);

      await interaction.deleteReply();
    },
  },
});
