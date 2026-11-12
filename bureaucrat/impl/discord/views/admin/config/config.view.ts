import { createView } from '../../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import { pickedRoles } from '../../../../../engine/discord/components/role-picker';
import { linear, separator, v2 } from '../../../../../engine/discord/elements';
import type { ViewGuard } from '../../../../../engine/discord/views/types';
import { getAccessConfig, updateGuildSettings } from '../../../../../drizzle/guild-settings';
import { invalidateGuildAccess } from '../../../../acl/cache';
import { Permissions } from '../../../../acl/permissions';
import { can, inGuild, type Locator } from '../../../guards';
import { renderAccess } from './access';
import { isArchetype, type Archetype } from './archetypes';

type ConfigState = { archetype: Archetype | null };

const dismiss = dismissButton<ConfigState>()({ action: 'dismiss' });

/** The pane is the guild's own: its entity is the guild id, checked against where it is pressed. */
const guildFromEntity: Locator = (ctx) =>
  ctx.view.entityId ? { domain: 'guild', id: ctx.view.entityId, guild: BigInt(ctx.view.entityId) } : null;

const manages: ViewGuard[] = [can(Permissions.Server.Manage, guildFromEntity)];

const COLUMN = {
  manager: 'managerRoles',
  moderator: 'moderatorRoles',
  storyteller: 'storytellerRoles',
  player: 'playerRoles',
} as const satisfies Record<Archetype, string>;

/**
 * `/admin config`: who the Managers, Moderators, Storytellers and Players are,
 * by Discord role (`acl/archetypes.ts`). Picking an archetype is navigation
 * and ungated; setting its roles needs a Manager.
 */
export default createView<ConfigState>()({
  id: 'adminconfig',
  idParams: [],
  events: {},
  defaultState: { archetype: null },
  subscribesTo: {},
  guards: { '*': [inGuild], roles: manages },

  render: async (view) => {
    const config = await getAccessConfig(BigInt(view.entityId!));
    const body = renderAccess(view, config, view.state?.archetype ?? null);

    return { ...v2(linear(...body, separator(), dismiss.row(view))), allowedMentions: { parse: [] } };
  },

  interactions: {
    ...dismiss.interactions,

    archetype: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const picked = interaction.values[0];
      await ctx.updateState({ archetype: isArchetype(picked) ? picked : null });
      return { action: 'render' };
    },

    roles: async (interaction, ctx) => {
      if (!interaction.isRoleSelectMenu()) return;
      await interaction.deferUpdate();

      const archetype = ctx.view.state?.archetype;
      if (!archetype) return { action: 'render' };

      const guild = BigInt(ctx.view.entityId!);
      await updateGuildSettings(guild, { [COLUMN[archetype]]: pickedRoles(interaction.values) });
      invalidateGuildAccess(guild);
      return { action: 'render' };
    },
  },
});
