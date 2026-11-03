import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { confirmButton, type ConfirmState } from '../../../../engine/discord/components/confirm';
import { modal, field } from '../../../../engine/discord/components/modal';
import { tabs } from '../../../../engine/discord/components/tabs';
import { text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';

import { getAclRole, updateAclRole, deleteAclRole } from '../../../../drizzle/acl-roles';
import { insertAclBinding, listBindingsByRole, deleteAclBinding } from '../../../../drizzle/acl-bindings';
import { listGrantsByRole, upsertAclGrant, deleteAclGrant } from '../../../../drizzle/acl-grants';
import { invalidateGuildAcl } from '../../../acl/cache';
import { tryDeleteReply } from '../../../../engine/discord/reply';
import { Permissions } from '../../../acl/permissions';
import { can, inGuild } from '../../guards';
import type { InteractionHandler } from '../../../../engine/discord/views/types';
import { AclEvents } from './events';
import { renderBindings } from './role/bindings';
import { renderDetails } from './role/details';
import { renderPermissions, type PermissionsState } from './role/permissions';
import { TABS, type RoleTab } from './role/tabs';

type EditState = ConfirmState<'delete'> &
  PermissionsState & {
    /** Which tab is up - where the admin is looking, not a property of the role. */
    tab: RoleTab;
  };

const admin = [can(Permissions.Server.Permissions)];

const dismiss = dismissButton<EditState>()({
  action: 'dismiss',
  notify: [AclEvents.RolesChanged],
});

const strip = tabs<EditState>()({ field: 'tab', tabs: TABS, fallback: 'details' });

const del = confirmButton<EditState>()({
  action: 'delete',
  label: 'Delete Role',
  onConfirm: async (ctx, interaction) => {
    const role = await getAclRole(ctx.view.entityId!);
    if (role) {
      await deleteAclRole(role.id);
      invalidateGuildAcl(role.guild);
    }
    await ctx.notify(AclEvents.RolesChanged);
    await tryDeleteReply(interaction);
  },
});

const editModal = modal<EditState>()({
  action: 'edit-details',
  title: 'Edit Role',
  fields: {
    name: field.short('Role Name', { maxLength: 50 }),
    priority: field.short('Priority', { required: false }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const name = values['name']!.trim().toLowerCase();
    const priority = parseInt(values['priority'] || '0', 10) || 0;

    const role = await updateAclRole(ctx.view.entityId!, { name, priority });
    if (role) invalidateGuildAcl(role.guild);

    await ctx.notifyAll(AclEvents.RolesChanged);
    await tryDeleteReply(interaction);
  },
});

/**
 * Writes the selected permission's decision; shared by Allow, Default and
 * Deny, which differ only in what they write. `null` removes the grant, which
 * is what "Default" means: the role no longer says anything about it.
 */
const grant = (decision: 'allow' | 'deny' | null) =>
  (async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    await interaction.deferUpdate();

    const permission = ctx.view.state.selectedPermission;
    if (!permission) return { action: 'render' };

    const role = await getAclRole(ctx.view.entityId!);
    if (!role) return { action: 'render' };

    if (decision === null) await deleteAclGrant(role.id, permission, null, null);
    else await upsertAclGrant({ aclRole: role.id, permission, decision });

    invalidateGuildAcl(role.guild);
    await ctx.updateState({ selectedPermission: null });
    await ctx.notifyAll(AclEvents.GrantsChanged);

    return { action: 'render' };
  }) satisfies InteractionHandler<EditState>;

/**
 * One role, three faces: what it is, who holds it, what it may do.
 *
 * Tab switches and dismiss stay open; every key that changes the role is
 * gated on `server.permissions`, so a custom id replayed after a demotion is
 * refused whichever tab it came from.
 */
export default createView<EditState, typeof AclEvents>()({
  id: 'aclroleedit',
  idParams: [],
  events: AclEvents,
  defaultState: { tab: 'details', selectedPermission: null },
  subscribesTo: { render: [AclEvents.RolesChanged, AclEvents.BindingsChanged, AclEvents.GrantsChanged] },
  guards: {
    '*': [inGuild],
    'edit-details': admin,
    'edit-details-submit': admin,
    delete: admin,
    'delete-confirm': admin,
    bind: admin,
    unbind: admin,
    'grant-select': admin,
    'set-allow': admin,
    'set-default': admin,
    'set-deny': admin,
  },

  render: async (view) => {
    const role = await getAclRole(view.entityId!);
    if (!role) return v2(linear(text('Role not found.')));

    const tab = strip.active(view);

    if (tab === 'delete') {
      return v2(
        linear(
          strip.row(view),
          separator(),
          text('### Delete'),
          text(`Deleting **${role.name}** removes the role, its bindings and its grants. This cannot be undone.`),
          separator(),
          del.isConfirming(view) ? del.confirmRow(view) : del.row(view),
          separator(),
          dismiss.row(view),
        ),
      );
    }

    if (tab === 'bindings') {
      const { body, controls } = renderBindings(view, role.name, await listBindingsByRole(role.id));

      // Navigation, content, actions, then the pane's own controls: the strip
      // is the header, and Dismiss has the last row to itself on every tab.
      return v2(linear(strip.row(view), separator(), ...body, ...controls, separator(), dismiss.row(view)));
    }

    if (tab === 'permissions') {
      const { body, controls } = renderPermissions(view, role.name, await listGrantsByRole(role.id));

      // The decision row appears once a permission is picked.
      const decisions = view.state.selectedPermission
        ? [
            buttonRow(
              button(view.customId('set-allow'), 'Allow', ButtonStyle.Success),
              button(view.customId('set-default'), 'Default', ButtonStyle.Secondary),
              button(view.customId('set-deny'), 'Deny', ButtonStyle.Danger),
            ),
          ]
        : [];

      return v2(
        linear(strip.row(view), separator(), ...body, ...controls, ...decisions, separator(), dismiss.row(view)),
      );
    }

    const bindings = await listBindingsByRole(role.id);
    const grants = await listGrantsByRole(role.id);

    return v2(
      linear(
        strip.row(view),
        separator(),
        ...renderDetails(role, bindings, grants),
        buttonRow(button(view.customId('edit-details'), 'Edit Details', ButtonStyle.Primary)),
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

    'edit-details': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const role = await getAclRole(ctx.view.entityId!);
      if (!role) return;

      await editModal.show(interaction, ctx, {
        values: {
          name: role.name,
          priority: role.priority.toString(),
        },
      });
    },

    bind: async (interaction, ctx) => {
      if (!interaction.isAnySelectMenu()) return;
      await interaction.deferUpdate();

      const role = await getAclRole(ctx.view.entityId!);
      if (!role) return;

      const value = interaction.values[0];
      if (!value) return;

      // A mentionable select resolves roles and users separately; the picked
      // value is a role exactly when the roles collection has it.
      const isRole = interaction.componentType === ComponentType.MentionableSelect && interaction.roles?.size > 0;

      await insertAclBinding({
        aclRole: role.id,
        role: isRole ? BigInt(value) : null,
        member: isRole ? null : BigInt(value),
      });

      invalidateGuildAcl(role.guild);
      await ctx.notifyAll(AclEvents.BindingsChanged);
    },

    unbind: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const bindingId = interaction.values[0];
      if (!bindingId) return;

      const role = await getAclRole(ctx.view.entityId!);
      await deleteAclBinding(bindingId);

      if (role) invalidateGuildAcl(role.guild);
      await ctx.notifyAll(AclEvents.BindingsChanged);
    },

    'grant-select': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      await ctx.updateState({ selectedPermission: interaction.values[0] ?? null });

      return { action: 'render' };
    },

    'set-allow': grant('allow'),
    'set-default': grant(null),
    'set-deny': grant('deny'),
  },
});
