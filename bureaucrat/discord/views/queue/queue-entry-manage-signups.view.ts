import { ButtonStyle } from 'discord.js';
import { createView } from '../../frameworks/views/create-view';
import { deleteViewMessage } from '../../frameworks/views/lifecycle';
import { dismissButton } from '../components/dismiss';
import { text, separator, linear, buttonRow, selectRow, select, button, v2 } from '../../elements';

import { listSignups, updateSignup } from '../../../drizzle/queue-entry-signups';
import { QueueEvents, QueueEntryEvents } from './events';

type Role = 'Player' | 'Storyteller' | 'Kibitzer';

type ManageSignupsState = {
  selectedSignupId: string | null;
  memberNames: Record<string, string>;
  roleFilter: Role[];
};

const signupStatusLine = (member: bigint, role: string, accepted: boolean | null) => {
  const mention = `<@${member}>`;
  if (accepted === true) return `\u2705 You accepted ${mention}'s signup for the ${role} role.`;
  if (accepted === false) return `\u274C You declined ${mention}'s signup for the ${role} role.`;
  return `${mention} is requesting the ${role} role.`;
};

const signupStatusLabel = (accepted: boolean | null) =>
  accepted === true ? 'Accepted' : accepted === false ? 'Declined' : 'Pending';

const dismiss = dismissButton<ManageSignupsState>()({ action: 'dismiss' });

export default createView<ManageSignupsState>()({
  id: 'qmsignups',
  idParams: [],
  events: {},
  defaultState: { selectedSignupId: null, memberNames: {}, roleFilter: [] },
  subscribesTo: { destroy: [QueueEvents.Destroyed, QueueEntryEvents.Destroyed] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const state = view.state;
    const allSignups = await listSignups(view.entityId!);

    if (allSignups.length === 0) {
      return v2(linear(text('### Manage Signups'), separator(), text('*No signups yet.*'), dismiss.row(view)));
    }

    const roles: Role[] = ['Player', 'Storyteller', 'Kibitzer'];
    const filterMenu = selectRow(
      select(view.customId('filter'), 'Filter by role')
        .setMinValues(0)
        .setMaxValues(roles.length)
        .addOptions(roles.map((r) => ({ label: r, value: r, default: state.roleFilter.includes(r) }))),
    );

    const signups =
      state.roleFilter.length > 0 ? allSignups.filter((s) => state.roleFilter.includes(s.role as Role)) : allSignups;

    const signupMenu =
      signups.length > 0
        ? selectRow(
            select(view.customId('select'), 'Select a signup to manage').addOptions(
              signups.map((s) => ({
                label: `${state.memberNames[String(s.member)] ?? String(s.member)} — ${s.role}`,
                description: signupStatusLabel(s.accepted),
                value: s.id,
                default: s.id === state.selectedSignupId,
              })),
            ),
          )
        : text('*No signups match the selected roles.*');

    const selected = state.selectedSignupId ? signups.find((s) => s.id === state.selectedSignupId) : null;

    const selectedDetail = selected
      ? [
          separator(),
          text(signupStatusLine(selected.member, selected.role, selected.accepted)),
          ...(selected.message ? [separator(), text(`> ${selected.message}`), separator()] : []),
          buttonRow(
            button(view.customId('accept'), 'Accept', ButtonStyle.Success),
            button(view.customId('decline'), 'Decline', ButtonStyle.Danger),
            button(view.customId('reset'), 'Pending', ButtonStyle.Secondary),
          ),
        ]
      : [];

    return v2(
      linear(text('### Manage Signups'), separator(), filterMenu, signupMenu, ...selectedDetail, dismiss.row(view)),
    );
  },

  interactions: {
    ...dismiss.interactions,

    filter: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const newFilter = interaction.values as Role[];
      const state = ctx.view.state!;

      let selectedSignupId = state.selectedSignupId;
      if (selectedSignupId && newFilter.length > 0) {
        const signups = await listSignups(ctx.view.entityId!);
        const selected = signups.find((s) => s.id === selectedSignupId);
        if (!selected || !newFilter.includes(selected.role as Role)) {
          selectedSignupId = null;
        }
      }

      await ctx.updateState({ roleFilter: newFilter, selectedSignupId });

      return { action: 'render' };
    },

    select: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      await ctx.updateState({ selectedSignupId: interaction.values[0]! });

      return { action: 'render' };
    },

    accept: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      if (!state.selectedSignupId) return;

      await updateSignup(state.selectedSignupId, { accepted: true });

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'render' };
    },

    decline: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      if (!state.selectedSignupId) return;

      await updateSignup(state.selectedSignupId, { accepted: false });

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'render' };
    },

    reset: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state!;
      if (!state.selectedSignupId) return;

      await updateSignup(state.selectedSignupId, { accepted: null });

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'render' };
    },
  },
});
