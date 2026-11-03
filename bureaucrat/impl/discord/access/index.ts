import { PermissionFlagsBits, type BaseInteraction } from 'discord.js';
import { resolvePermission, type AclLocation } from '../../acl/resolve';
import type { Permission } from '../../acl/permissions';
import { S } from '../../../strings';

/**
 * Who is pressing the button, as the ACL resolver wants to hear it.
 *
 * `roles` includes `@everyone` (the guild's own id), so a binding on it reaches
 * every member. `owner` and `manageGuild` are the two bypasses the resolver
 * knows about; see `resolvePermission` for when each applies.
 */
export type Actor = { id: bigint; roles: bigint[]; manageGuild: boolean; owner: boolean };

export type AccessResult = { ok: true } | { ok: false; reason: string };

/**
 * The actor, read off the interaction and nothing else.
 *
 * No fetch anywhere in here, which is what makes this cheap enough to put on
 * every guarded action. Discord ships the member's roles and their computed
 * permissions in the interaction payload precisely so a bot does not have to
 * ask, and the ACL cache is the only cost the decision carries.
 *
 * Returns null outside a guild. Interactions never arrive from DMs today, but
 * `inGuild` is a separate guard and this should not be the thing that decides
 * what happens when one does.
 */
export const actorOf = (interaction: BaseInteraction): Actor | null => {
  if (!interaction.inGuild()) return null;

  const member = interaction.member;

  // `GuildMember.roles` is a manager, `APIInteractionGuildMember.roles` is a
  // plain array of ids. Which one arrives depends on whether the guild is
  // cached, so both shapes have to be handled for the same person.
  const held = member === null ? [] : Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];

  return {
    id: BigInt(interaction.user.id),

    // `@everyone` carries the guild's own id and is absent from the raw shape.
    roles: [...new Set([...held, interaction.guildId])].map(BigInt),

    // Discord folds Administrator and guild ownership into the computed
    // permissions it sends, and discord.js checks the admin bit by default, so
    // both reach this as `true` without being special-cased.
    manageGuild: interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,

    owner: interaction.guild?.ownerId === interaction.user.id,
  };
};

/**
 * The decision, with the ACL consulted.
 *
 * A command handler and a `ViewGuard` have incompatible signatures and neither
 * can call the other, so both wrap this.
 */
export const accessAllows = async (
  guild: bigint,
  actor: Actor,
  permission: Permission,
  location?: AclLocation,
): Promise<AccessResult> => {
  const decision = await resolvePermission(guild, actor.id, actor.roles, permission, location, {
    isOwner: actor.owner,
    hasManageGuild: actor.manageGuild,
  });

  return decision === 'allow' ? { ok: true } : { ok: false, reason: S.errors.noPermission };
};
