import type { ViewContext, ViewGuard } from '../../../engine/discord/views/types';
import type { Permission } from '../../acl/permissions';
import { accessAllows, actorOf } from '../access';
import { inSameGuild } from './scope';
import { S } from '../../../strings';

/**
 * The record a permission is being exercised on, and the guild that owns it.
 *
 * The guild is what lets `can` refuse a custom id replayed from another server:
 * access is decided by the interaction's guild, so without this check a
 * Manager in guild A could edit guild B's queue by id.
 */
export type Located = { domain: string; id: string; guild: bigint };

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
 * The actor holds `permission`; with a locator, the record must also belong to
 * the interaction's guild. Put this on the acting keys rather
 * than on `'*'`: a gated `dismiss` strands the panel on screen for anyone the
 * guard turns away.
 */
export const can =
  (permission: Permission, locate?: Locator): ViewGuard =>
  async (interaction, ctx) => {
    const actor = actorOf(interaction);
    if (actor === null) return S.errors.guildOnly;

    if (locate) {
      const located = await locate(ctx);
      if (!located || !inSameGuild(located.guild, interaction.guildId)) return S.errors.notHere;
    }

    const verdict = await accessAllows(BigInt(interaction.guildId!), actor, permission);

    return verdict.ok ? true : verdict.reason;
  };
