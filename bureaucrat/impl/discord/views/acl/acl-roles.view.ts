import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { modal, field } from '../../../../engine/discord/components/modal';

import { listAclRolesByGuild, insertAclRole } from '../../../../drizzle/acl-roles';
import { invalidateGuildAcl } from '../../../acl/cache';
import { tryDeleteReply } from '../../../../engine/discord/reply';
import { Permissions } from '../../../acl/permissions';
import { can, inGuild } from '../../guards';
import { AclEvents } from './events';

type RolesState = Record<string, never>;

const admin = [can(Permissions.Server.Permissions)];

const dismiss = dismissButton<RolesState>()({ action: 'dismiss' });

const addRoleModal = modal<RolesState>()({
  action: 'add-role',
  title: 'Create ACL Role',
  fields: {
    name: field.short('Role Name', { maxLength: 50 }),
    priority: field.short('Priority', { required: false, placeholder: '0 (higher = more authority)' }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const guildId = BigInt(interaction.guildId!);
    const name = values['name']!.trim().toLowerCase();
    const priority = parseInt(values['priority'] || '0', 10) || 0;

    await insertAclRole({ guild: guildId, name, priority });
    invalidateGuildAcl(guildId);

    await ctx.notifyAll(AclEvents.RolesChanged);
    await tryDeleteReply(interaction);
  },
});

export default createView<RolesState, typeof AclEvents>()({
  id: 'aclroles',
  // The role a button targets rides the custom id; dispatch overlays it onto ctx.ids.
  idParams: ['aclrole'],
  events: AclEvents,
  defaultState: {},
  subscribesTo: { render: [AclEvents.RolesChanged] },
  guards: { '*': [inGuild], add: admin, 'add-role-submit': admin, edit: admin },

  render: async (view) => {
    // entityId stores the guild snowflake as a string
    const guild = BigInt(view.entityId!);
    const roles = await listAclRolesByGuild(guild);

    const roleLines = roles.map((r) => `**${r.name}** — priority ${r.priority}`).join('\n');

    const roleButtons = roles.map((r) => button(view.customId('edit', r.id), r.name, ButtonStyle.Secondary));

    // Discord limits 5 buttons per row
    const rows: ReturnType<typeof buttonRow>[] = [];
    for (let i = 0; i < roleButtons.length; i += 5) {
      rows.push(buttonRow(...roleButtons.slice(i, i + 5)));
    }

    return v2(
      linear(
        text('### Access Control Roles'),
        separator(),
        text(roleLines || '*No roles configured.*'),
        separator(),
        ...rows,
        buttonRow(button(view.customId('add'), 'New Role', ButtonStyle.Success), dismiss.button(view)),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,
    ...addRoleModal.interactions,

    add: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await addRoleModal.show(interaction, ctx);
    },

    edit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const roleId = ctx.ids['aclrole'];
      if (!roleId) return;

      await ctx.spawnView(
        'aclroleedit',
        { interaction },
        {
          visibility: 'ephemeral',
          entityId: roleId,
        },
      );
    },
  },
});
