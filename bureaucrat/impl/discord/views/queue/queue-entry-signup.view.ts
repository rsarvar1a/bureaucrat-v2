import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { destroyView, deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { modal, field } from '../../../../engine/discord/components/modal';
import { text, separator, linear, buttonRow, selectRow, select, button, v2 } from '../../../../engine/discord/elements';

import { getQueueEntry } from '../../../../drizzle/queue-entries';
import { insertSignup, updateSignup, deleteSignup } from '../../../../drizzle/queue-entry-signups';
import { tryDeleteReply } from '../../../../engine/discord/reply';
import { QueueEvents, QueueEntryEvents } from './events';
import { acceptsSignups, initialAcceptance } from './signup-mode';
import { S } from '../../../../strings';

type SignupState = {
  mode: 'new' | 'existing';
  signupId: string | null;
  selectedRole?: 'Player' | 'Storyteller' | 'Kibitzer';
};

const dismiss = dismissButton<SignupState>()({ action: 'dismiss' });

const messageModal = modal<SignupState>()({
  action: 'message',
  title: 'Sign Up',
  fields: {
    message: field.paragraph('Message (optional)', { required: false, maxLength: 500 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const state = ctx.view.state!;
    const entryId = ctx.ids['qentry']!;
    const message = values['message'] || undefined;
    const entry = await getQueueEntry(entryId);
    if (!entry) return;

    // The mode may have closed while this pane was open.
    if (!acceptsSignups(entry.signups)) {
      await interaction.followUp({ content: S.errors.signupsClosed, flags: [MessageFlags.Ephemeral] });
      await destroyView(ctx.view.id);
      await tryDeleteReply(interaction);
      return;
    }

    const accepted = initialAcceptance(entry.signups, state.selectedRole!);

    await insertSignup({
      member: BigInt(interaction.user.id),
      entry: entryId,
      role: state.selectedRole!,
      message,
      accepted,
    });

    await ctx.notify(QueueEntryEvents.SignupsChanged);

    await destroyView(ctx.view.id);
    await tryDeleteReply(interaction);
  },
});

const editSignupModal = modal<SignupState>()({
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

    await ctx.notify(QueueEntryEvents.SignupsChanged);

    await tryDeleteReply(interaction);
  },
});

export default createView<SignupState>()({
  id: 'qsignup',
  idParams: [],
  events: {},
  defaultState: { mode: 'new', signupId: null },
  subscribesTo: { destroy: [QueueEvents.Destroyed, QueueEntryEvents.Destroyed] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const state = view.state;

    if (state.mode === 'existing' && state.signupId) {
      return v2(
        linear(
          text('### Your Signup'),
          separator(),
          text("You've already signed up for this game. You can edit your message or withdraw below."),
          separator(),
          buttonRow(
            button(view.customId('edit'), 'Edit', ButtonStyle.Primary),
            button(view.customId('delete'), 'Delete', ButtonStyle.Danger),
          ),
          dismiss.row(view),
        ),
      );
    }

    return v2(
      linear(
        text('### Sign Up'),
        separator(),
        text('Select a role to sign up for this game.'),
        selectRow(
          select(view.customId('role-select'), 'Select a role').addOptions(
            { label: 'Player', value: 'Player', description: 'Play in the game' },
            { label: 'Storyteller', value: 'Storyteller', description: 'Co-Storytell the game' },
            { label: 'Kibitzer', value: 'Kibitzer', description: 'Spectate the game' },
          ),
        ),
        dismiss.row(view),
      ),
    );
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

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      await tryDeleteReply(interaction);
    },
  },
});
