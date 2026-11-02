import { createView } from '../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { confirmButton, type ConfirmState } from '../../../../engine/discord/components/confirm';
import { modal, field } from '../../../../engine/discord/components/modal';
import { bump } from '../../../../engine/discord/components/stepper';
import { tabs } from '../../../../engine/discord/components/tabs';
import { text, separator, linear, v2 } from '../../../../engine/discord/elements';
import { tryDeleteReply } from '../../../../engine/discord/reply';
import type { InteractionHandler, ViewGuard } from '../../../../engine/discord/views/types';

import { getQueue, updateQueue } from '../../../../drizzle/queues';
import { offerVacancy } from '../../games/vacancy';
import { Permissions } from '../../../acl/permissions';
import { can, inGuild } from '../../guards';
import { queueFromEntity } from '../../guards/queue';
import { QueueEvents } from './events';
import { renderCategory } from './settings/category';
import { renderDescription } from './settings/description';
import { BUMP_ACTIONS, parseBump, renderResources, type BumpAction } from './settings/resources';
import { TABS, type SettingsTab } from './settings/tabs';

type ManageState = ConfirmState<'delete'> & { tab: SettingsTab };

const dismiss = dismissButton<ManageState>()({ action: 'dismiss' });

const strip = tabs<ManageState>()({ field: 'tab', tabs: TABS, fallback: 'description' });

const editModal = modal<ManageState>()({
  action: 'edit',
  title: 'Edit Queue',
  fields: {
    name: field.short('Queue Name', { maxLength: 100 }),
    description: field.paragraph('Description', { required: false, maxLength: 1000 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    await updateQueue(ctx.view.entityId!, { name: values['name']!, description: values['description'] || null });
    await ctx.notifyAll(QueueEvents.EntriesChanged);

    return { action: 'render' };
  },
});

const del = confirmButton<ManageState>()({
  action: 'delete',
  label: 'Delete',
  onConfirm: async (ctx, interaction) => {
    await ctx.notifyAll(QueueEvents.Destroyed);
    await tryDeleteReply(interaction);
  },
});

// Every stepper press lands here by its own key, so each carries the edit
// guard like any other button rather than riding under '*'.
const bumps = Object.fromEntries(
  BUMP_ACTIONS.map((action) => [
    action,
    (async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const press = parseBump(ctx.action);
      const queue = await getQueue(ctx.view.entityId!);
      if (!press || !queue) return { action: 'render' };

      const value = bump(press.spec, queue[press.spec.column], press.nudge);
      await updateQueue(queue.id, { [press.spec.column]: value });
      await ctx.notifyAll(QueueEvents.EntriesChanged);

      // A raised cap is a vacancy, same as a game ending.
      const before = queue.concurrency;
      const raised = press.spec.column === 'concurrency' && before !== null && (value === null || value > before);
      if (raised) await offerVacancy(ctx.spawnView, { interaction }, queue.id);

      return { action: 'render' };
    }) satisfies InteractionHandler<ManageState>,
  ]),
) as Record<BumpAction, InteractionHandler<ManageState>>;

const edits = [can(Permissions.Queue.Edit, queueFromEntity)];
const deletes = [can(Permissions.Queue.Delete, queueFromEntity)];

export default createView<ManageState>()({
  id: 'queuemanage',
  idParams: [],
  events: {},
  defaultState: { tab: 'description' },
  subscribesTo: { destroy: [QueueEvents.Destroyed] },
  guards: {
    '*': [inGuild],
    edit: edits,
    'edit-submit': edits,
    previews: edits,
    category: edits,
    archive: edits,
    ...(Object.fromEntries(BUMP_ACTIONS.map((action) => [action, edits])) as Record<BumpAction, ViewGuard[]>),
    delete: deletes,
    'delete-confirm': deletes,
  },

  render: async (view) => {
    const queue = await getQueue(view.entityId!);
    if (!queue) return v2(linear(text('Queue not found.')));

    const tab = strip.active(view);

    const body =
      tab === 'resources'
        ? renderResources(view, queue)
        : tab === 'category'
          ? renderCategory(view, queue)
          : tab === 'delete'
            ? [
                text('### Delete'),
                text(
                  `Deleting **${queue.name}** removes the queue, all its entries and all their signups. Games already claimed from it stay. This cannot be undone.`,
                ),
                separator(),
                del.isConfirming(view) ? del.confirmRow(view) : del.row(view),
              ]
            : renderDescription(view, queue);

    return v2(linear(strip.row(view), separator(), ...body, separator(), dismiss.row(view)));
  },

  interactions: {
    ...dismiss.interactions,
    ...strip.interactions,
    ...del.interactions,
    ...editModal.interactions,
    ...bumps,

    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const queue = await getQueue(ctx.view.entityId!);
      if (!queue) return;

      await editModal.show(interaction, ctx, {
        values: { name: queue.name, description: queue.description ?? '' },
      });
    },

    previews: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const queue = await getQueue(ctx.view.entityId!);
      if (!queue) return { action: 'render' };

      await updateQueue(queue.id, { entryPreviews: !queue.entryPreviews });
      await ctx.notifyAll(QueueEvents.EntriesChanged);

      return { action: 'render' };
    },

    category: async (interaction, ctx) => {
      if (!interaction.isChannelSelectMenu()) return;
      await interaction.deferUpdate();

      const chosen = interaction.values[0];
      await updateQueue(ctx.view.entityId!, { category: chosen ? BigInt(chosen) : null });

      return { action: 'render' };
    },

    archive: async (interaction, ctx) => {
      if (!interaction.isChannelSelectMenu()) return;
      await interaction.deferUpdate();

      const chosen = interaction.values[0];
      await updateQueue(ctx.view.entityId!, { archive: chosen ? BigInt(chosen) : null });

      return { action: 'render' };
    },
  },
});
