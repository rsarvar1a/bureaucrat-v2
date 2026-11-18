import { createView } from '../../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import { pickedRoles } from '../../../../../engine/discord/components/role-picker';
import { bump, type Nudge } from '../../../../../engine/discord/components/stepper';
import { tabs } from '../../../../../engine/discord/components/tabs';
import { linear, separator, v2 } from '../../../../../engine/discord/elements';
import type { InteractionHandler, ViewGuard } from '../../../../../engine/discord/views/types';
import { getAccessConfig, getOrCreateGuildSettings, updateGuildSettings } from '../../../../../drizzle/guild-settings';
import { invalidateGuildAccess } from '../../../../acl/cache';
import { resyncGuildOverwrites } from '../../../games/member-overwrite';
import { logger } from '../../../../../utilities/logger';
import { Permissions } from '../../../../acl/permissions';
import { can, inGuild, type Locator } from '../../../guards';
import { renderAccess } from './access';
import { isArchetype, type Archetype } from './archetypes';
import { COOLDOWN_ACTIONS, COOLDOWN_STEPPER, renderRecruitment, type CooldownAction } from './recruitment';
import { TABS, type ConfigTab } from './tabs';

type ConfigState = { tab: ConfigTab; archetype: Archetype | null };

const dismiss = dismissButton<ConfigState>()({ action: 'dismiss' });

const strip = tabs<ConfigState>()({ field: 'tab', tabs: TABS, fallback: 'access' });

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

const cooldown: InteractionHandler<ConfigState> = async (interaction, ctx) => {
  if (!interaction.isMessageComponent()) return;
  await interaction.deferUpdate();

  const nudge = ctx.action.split(':')[2] as Nudge;
  const guild = BigInt(ctx.view.entityId!);
  const settings = await getOrCreateGuildSettings(guild);
  const value = bump(COOLDOWN_STEPPER, settings.recruitCooldown, nudge);
  if (value !== null) await updateGuildSettings(guild, { recruitCooldown: value });
  return { action: 'render' };
};

/**
 * `/admin config`: who the Managers, Moderators, Storytellers and Players are,
 * by Discord role (`acl/archetypes.ts`), and the server's recruitment. Tabs
 * and picking an archetype are navigation and ungated; every write needs a
 * Manager.
 */
export default createView<ConfigState>()({
  id: 'adminconfig',
  idParams: [],
  events: {},
  defaultState: { tab: 'access', archetype: null },
  subscribesTo: {},
  guards: {
    '*': [inGuild],
    roles: manages,
    'recruit-roles': manages,
    ...(Object.fromEntries(COOLDOWN_ACTIONS.map((action) => [action, manages])) as Record<CooldownAction, ViewGuard[]>),
  },

  render: async (view, _db, client) => {
    const guild = BigInt(view.entityId!);
    const body =
      strip.active(view) === 'recruitment'
        ? await renderRecruitment(view, await getOrCreateGuildSettings(guild), client)
        : renderAccess(view, await getAccessConfig(guild), view.state?.archetype ?? null);

    return {
      ...v2(linear(strip.row(view), separator(), ...body, separator(), dismiss.row(view))),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...dismiss.interactions,
    ...strip.interactions,
    ...(Object.fromEntries(COOLDOWN_ACTIONS.map((action) => [action, cooldown])) as Record<
      CooldownAction,
      InteractionHandler<ConfigState>
    >),

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
      // Who is a Moderator decides which players' channel overwrites take Manage Threads away.
      if (archetype === 'moderator' || archetype === 'manager') {
        void resyncGuildOverwrites(interaction.client, guild).catch((error: unknown) =>
          logger.warn({ message: `Could not resync the player overwrites of guild ${guild}.`, error }),
        );
      }
      return { action: 'render' };
    },

    'recruit-roles': async (interaction, ctx) => {
      if (!interaction.isRoleSelectMenu()) return;
      await interaction.deferUpdate();
      await updateGuildSettings(BigInt(ctx.view.entityId!), { recruitRoles: pickedRoles(interaction.values) });
      return { action: 'render' };
    },
  },
});
