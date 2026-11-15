import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { inGuild } from '../../guards';
import { canManageEntry } from '../../guards/queue';

import { deleteQueueEntry, getQueueEntry } from '../../../../drizzle/queue-entries';
import { listSignups, getSignupByMemberAndEntry } from '../../../../drizzle/queue-entry-signups';
import { countScriptPages, getEntryScriptSummary } from '../../../../drizzle/scripts';
import { QueueEvents, QueueEntryEvents } from './events';
import { acceptsSignups, modeLabel } from './signup-mode';
import { ROLES } from './manage/signups';
import { S } from '../../../../strings';

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
  guards: { '*': [inGuild], manage: [canManageEntry] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
    await deleteQueueEntry(view.entityId!);
  },

  render: async (view) => {
    const entry = await getQueueEntry(view.entityId!);
    if (!entry) {
      return v2(linear(text('Entry not found.')));
    }

    const [signups, script] = await Promise.all([listSignups(entry.id), getEntryScriptSummary(entry.id)]);
    const pages = script?.hasPdf ? await countScriptPages(script.id) : 0;

    // Accepted signups by role, numbered; under each, those not yet answered. Declined ones are not shown.
    const sections = ROLES.map((role) => {
      const ofRole = signups.filter((s) => s.role === role);
      const accepted = ofRole.filter((s) => s.accepted === true).map((s) => `<@${s.member}>`);
      const pending = ofRole.filter((s) => s.accepted === null).map((s) => `<@${s.member}>`);
      if (accepted.length === 0 && pending.length === 0) return null;
      return [
        `**${role}s:**`,
        ...accepted.map((m, i) => `${i + 1}. ${m}`),
        ...(pending.length > 0 ? [S.games.pendingLine(pending)] : []),
      ].join('\n');
    }).filter((section) => section !== null);
    const signupText = sections.length > 0 ? sections.join('\n\n') : '*No signups yet.*';

    const c = linear(
      text(`### ${entry.title}\n<@${entry.storyteller}>`),
      separator(),
      ...(entry.description ? [text(entry.description), separator()] : []),
      text(
        [
          `**Signups:** ${modeLabel(entry.signups)}`,
          ...(entry.minimumStartDate
            ? [`**Earliest start:** <t:${Math.floor(entry.minimumStartDate.getTime() / 1000)}:R>`]
            : []),
          ...(script?.hasPdf ? [`**Script:** ${script.pdfName ?? 'script.pdf'}`] : []),
        ].join(' · '),
      ),
      text(signupText),
      separator(),
      buttonRow(
        button(view.customId('signup'), 'Signup', ButtonStyle.Primary).setDisabled(!acceptsSignups(entry.signups)),
        ...(pages > 0 ? [button(view.customId('preview'), 'Preview', ButtonStyle.Secondary)] : []),
        button(view.customId('manage'), 'Manage', ButtonStyle.Secondary),
      ),
    ).setAccentColor(accent.success);

    return { ...v2(c), allowedMentions: { parse: [] } };
  },

  interactions: {
    signup: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const entry = await getQueueEntry(ctx.view.entityId!);
      if (!entry) return;

      const existing = await getSignupByMemberAndEntry(BigInt(interaction.user.id), entry.id);

      // The button is disabled while closed; this catches a card rendered before the mode changed.
      if (!existing && !acceptsSignups(entry.signups)) {
        await interaction.reply({ content: S.errors.signupsClosed, flags: [MessageFlags.Ephemeral] });
        return;
      }

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

    // Anyone in the server may look: a hopeful decides whether to sign up on what they see.
    preview: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const script = await getEntryScriptSummary(ctx.view.entityId!);
      if (!script?.hasPdf) {
        await interaction.reply({ content: S.errors.noEntryScript, flags: [MessageFlags.Ephemeral] });
        return;
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView(
        'gscriptpreview',
        { interaction },
        { visibility: 'ephemeral', state: { page: 0, script: script.id } },
      );
    },

    manage: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      await ctx.spawnView('qmanage', { interaction }, { visibility: 'ephemeral' });
    },
  },
});
