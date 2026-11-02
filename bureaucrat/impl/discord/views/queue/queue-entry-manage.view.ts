import { ButtonStyle } from 'discord.js';

import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { confirmButton, type ConfirmState } from '../../../../engine/discord/components/confirm';
import { modal, field } from '../../../../engine/discord/components/modal';
import { tabs } from '../../../../engine/discord/components/tabs';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { fetchUpload } from '../../../../engine/discord/uploads';

import { getQueue } from '../../../../drizzle/queues';
import { getQueueEntry, listQueueEntries, bumpEntry, updateQueueEntry } from '../../../../drizzle/queue-entries';
import { listSignups, updateSignup } from '../../../../drizzle/queue-entry-signups';
import {
  countScriptPages,
  deleteEntryScript,
  getEntryScriptSummary,
  replaceScriptPages,
  upsertEntryScript,
} from '../../../../drizzle/scripts';
import { isPdfUpload } from '../../games/script/parse';
import { renderAllPages } from '../../games/script/pdf';
import { PDF_LIMIT, PDF_LIMIT_LABEL, refusal } from '../../games/script/upload';
import { S } from '../../../../strings';
import { tryDeleteReply } from '../../../../engine/discord/reply';
import type { InteractionHandler } from '../../../../engine/discord/views/types';
import { inGuild } from '../../guards';
import { canManageEntry } from '../../guards/queue';
import { QueueEntryEvents, QueueEvents } from './events';
import { displayNames } from './members';
import { pdfButtons, renderDetails, signupModeRow } from './manage/details';
import { filtered, renderSignups, type Role, type SignupsState } from './manage/signups';
import { TABS, type ManageTab } from './manage/tabs';
import { isSignupMode } from './signup-mode';

type ManageState = ConfirmState<'delete'> &
  SignupsState & {
    tab: ManageTab;
  };

const dismiss = dismissButton<ManageState>()({ action: 'dismiss' });

const strip = tabs<ManageState>()({ field: 'tab', tabs: TABS, fallback: 'details' });

const editModal = modal<ManageState>()({
  action: 'edit',
  title: 'Edit Entry',
  fields: {
    title: field.short('Title', { maxLength: 100 }),
    description: field.paragraph('Description', { maxLength: 1000 }),
    minimumStartDate: field.short('Minimum Start Date (YYYY-MM-DD)', { required: false }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const entryId = ctx.view.entityId!;
    const dateStr = values['minimumStartDate'];

    await updateQueueEntry(entryId, {
      title: values['title']!,
      description: values['description']!,
      minimumStartDate: dateStr ? new Date(dateStr) : null,
    });

    await ctx.notify(QueueEvents.EntriesChanged, QueueEntryEvents.SignupsChanged);

    return { action: 'render' };
  },
});

// The same intake as the game's Script window: fetched, rasterised once, kept
// on a Script row owned by the entry until the entry is claimed.
const pdfModal = modal<ManageState>()({
  action: 'pdf',
  title: 'Upload the script PDF',
  fields: { file: field.file('Script PDF', { accept: ['application/pdf'], maxFiles: 1 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const upload = values['file'][0];
    if (!upload || !isPdfUpload(upload)) {
      await toast.followUp(interaction, S.errors.uploadWrongType('PDF'), { accent: accent.warning });
      return;
    }

    const fetched = await fetchUpload(upload, { maxBytes: PDF_LIMIT });
    if (!fetched.ok) {
      await toast.followUp(interaction, refusal(fetched, 'PDF', PDF_LIMIT_LABEL), { accent: accent.warning });
      return;
    }

    const pages = renderAllPages(fetched.bytes) ?? [];
    const row = await upsertEntryScript(ctx.view.entityId!, { pdf: fetched.bytes, pdfName: upload.name });
    await replaceScriptPages(row.id, pages);
    await ctx.notify(QueueEntryEvents.SignupsChanged);

    if (pages.length === 0) {
      await toast.followUp(interaction, S.errors.pdfNoPages, { accent: accent.warning });
    }

    return { action: 'render' };
  },
});

const del = confirmButton<ManageState>()({
  action: 'delete',
  label: 'Delete',
  onConfirm: async (ctx, interaction) => {
    await ctx.notifyAll(QueueEvents.EntriesChanged, QueueEntryEvents.Destroyed);
    await tryDeleteReply(interaction);
  },
});

const decide = (accepted: boolean | null) =>
  (async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    await interaction.deferUpdate();

    const signupId = ctx.view.state.selectedSignupId;
    if (!signupId) return { action: 'render' };

    await updateSignup(signupId, { accepted });

    await ctx.notify(QueueEntryEvents.SignupsChanged);

    return { action: 'render' };
  }) satisfies InteractionHandler<ManageState>;

const manages = [canManageEntry];

export default createView<ManageState>()({
  id: 'qmanage',
  idParams: [],
  events: {},
  defaultState: { tab: 'details', selectedSignupId: null, roleFilter: [] },
  subscribesTo: {
    render: [QueueEntryEvents.SignupsChanged],
    destroy: [QueueEvents.Destroyed, QueueEntryEvents.Destroyed],
  },
  guards: {
    '*': [inGuild],
    edit: manages,
    'edit-submit': manages,
    mode: manages,
    bump: manages,
    pdf: manages,
    'pdf-submit': manages,
    'pdf-remove': manages,
    delete: manages,
    'delete-confirm': manages,
    filter: manages,
    select: manages,
    accept: manages,
    decline: manages,
    reset: manages,
  },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const entry = await getQueueEntry(view.entityId!);
    if (!entry) return v2(linear(text('Entry not found.')));

    const tab = strip.active(view);

    if (tab === 'signups') {
      const signups = await listSignups(entry.id);
      const queue = await getQueue(entry.queue);
      const names = queue
        ? await displayNames(
            client,
            queue.guild,
            signups.map((s) => s.member),
          )
        : {};

      const { body, controls, selected } = renderSignups(view, entry.title, signups, names);

      const decisions = selected
        ? [
            buttonRow(
              button(view.customId('accept'), 'Accept', ButtonStyle.Success),
              button(view.customId('decline'), 'Decline', ButtonStyle.Danger),
              button(view.customId('reset'), 'Pending', ButtonStyle.Secondary),
            ),
          ]
        : [];

      return v2(
        linear(strip.row(view), separator(), ...body, ...controls, ...decisions, separator(), dismiss.row(view)),
      );
    }

    if (tab === 'delete') {
      return v2(
        linear(
          strip.row(view),
          separator(),
          text('### Delete'),
          text(`Deleting **${entry.title}** removes it from the queue along with every signup. This cannot be undone.`),
          separator(),
          del.isConfirming(view) ? del.confirmRow(view) : del.row(view),
          separator(),
          dismiss.row(view),
        ),
      );
    }

    const [entries, script] = await Promise.all([listQueueEntries(entry.queue), getEntryScriptSummary(entry.id)]);
    const isLast = entries[entries.length - 1]?.id === entry.id;
    const pages = script?.hasPdf ? await countScriptPages(script.id) : 0;

    return v2(
      linear(
        strip.row(view),
        separator(),
        ...renderDetails(entry, script, pages),
        signupModeRow(view, entry),
        buttonRow(
          button(view.customId('edit'), 'Edit', ButtonStyle.Primary),
          button(view.customId('bump'), 'Bump', ButtonStyle.Secondary).setDisabled(isLast),
          ...pdfButtons(view, script),
        ),
        separator(),
        dismiss.row(view),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,
    ...strip.interactions,
    ...del.interactions,
    ...editModal.interactions,
    ...pdfModal.interactions,

    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const entry = await getQueueEntry(ctx.view.entityId!);
      if (!entry) return;

      await editModal.show(interaction, ctx, {
        values: {
          title: entry.title,
          description: entry.description,
          minimumStartDate: entry.minimumStartDate ? entry.minimumStartDate.toISOString().split('T')[0]! : '',
        },
      });
    },

    mode: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const chosen = interaction.values[0];
      if (!chosen || !isSignupMode(chosen)) return { action: 'render' };

      await updateQueueEntry(ctx.view.entityId!, { signups: chosen });

      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'render' };
    },

    pdf: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await pdfModal.show(interaction, ctx);
    },

    'pdf-remove': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      await deleteEntryScript(ctx.view.entityId!);
      await ctx.notify(QueueEntryEvents.SignupsChanged);

      return { action: 'render' };
    },

    bump: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      await bumpEntry(ctx.view.entityId!);

      await ctx.notify(QueueEvents.EntriesChanged);

      return { action: 'render' };
    },

    filter: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const roleFilter = interaction.values as Role[];
      const state = ctx.view.state;

      let selectedSignupId = state.selectedSignupId;
      if (selectedSignupId) {
        const shown = filtered(await listSignups(ctx.view.entityId!), roleFilter);
        if (!shown.some((s) => s.id === selectedSignupId)) selectedSignupId = null;
      }

      await ctx.updateState({ roleFilter, selectedSignupId });

      return { action: 'render' };
    },

    select: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      await ctx.updateState({ selectedSignupId: interaction.values[0]! });

      return { action: 'render' };
    },

    accept: decide(true),
    decline: decide(false),
    reset: decide(null),
  },
});
