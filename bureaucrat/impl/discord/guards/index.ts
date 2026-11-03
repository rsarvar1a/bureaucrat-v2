import type { ViewContext, ViewGuard } from '../../../engine/discord/views/types';
import type { Permission } from '../../acl/permissions';
import type { AclLocation } from '../../acl/resolve';
import { accessAllows, actorOf } from '../access';
import { inSameGuild } from './scope';
import { S } from '../../../strings';

/**
 * Where a permission is being exercised, plus the guild that owns the record.
 *
 * The guild is what lets `can` refuse a custom id replayed from another server:
 * the ACL is keyed by the interaction's guild, so without this check a
 * server-wide grant in guild A would authorise editing guild B's queue by id.
 */
export type Located = AclLocation & { guild: bigint };

/**
 * How a guard finds the record an action targets.
 *
 * Entity-bound views (a queue panel and its children) carry the record in
 * `entityId`; a view that is not entity-bound holds its selection in state, so
 * resolution has to be parameterised. Returning null means "nothing to act
 * on", which refuses as `S.errors.notHere`.
 */
export type Locator = (ctx: ViewContext<unknown>) => Located | null | undefined | Promise<Located | null | undefined>;

/** Rejects interactions outside a guild. Interactions never happen in DMs. */
export const inGuild: ViewGuard = async (interaction) => (interaction.inGuild() ? true : S.errors.guildOnly);

/**
 * The actor holds `permission`, server-wide or at the located scope.
 *
 * With no locator the check is server-wide; with one, a location-scoped grant
 * or binding on that record also counts. Put this on the acting keys rather
 * than on `'*'`: a gated `dismiss` strands the panel on screen for anyone the
 * guard turns away.
 */
export const can =
  (permission: Permission, locate?: Locator): ViewGuard =>
  async (interaction, ctx) => {
    const actor = actorOf(interaction);
    if (actor === null) return S.errors.guildOnly;

    let location: AclLocation | undefined;

    if (locate) {
      const located = await locate(ctx);
      if (!located || !inSameGuild(located.guild, interaction.guildId)) return S.errors.notHere;

      location = { domain: located.domain, id: located.id };
    }

    const verdict = await accessAllows(BigInt(interaction.guildId!), actor, permission, location);

    return verdict.ok ? true : verdict.reason;
  };
