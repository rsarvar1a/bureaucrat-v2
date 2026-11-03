import { getGuildAcl } from './cache';
import type { Permission } from './permissions';

export type AclLocation = { domain: string; id: string };

/**
 * Resolves the effective permission decision for a user in a guild.
 *
 * Resolution rules:
 * 1. Owner bypass: guild owner always gets 'allow'
 * 2. Bootstrap fallback: if no ACL roles exist, or no bindings exist, a user with Discord
 *    ManageGuild gets 'allow'. No configuration can lock a guild out of its own bot.
 * 3. Deny always wins: any explicit 'deny' from any role blocks the permission
 * 4. Among 'allow' grants, location-specific beats server-wide; higher priority wins ties
 * 5. No grants = 'deny' (closed by default)
 */
export const resolvePermission = async (
  guildId: bigint,
  userId: bigint,
  discordRoleIds: bigint[],
  permission: Permission,
  location?: AclLocation,
  options?: { isOwner?: boolean; hasManageGuild?: boolean },
): Promise<'allow' | 'deny'> => {
  // 1. Owner bypass
  if (options?.isOwner) return 'allow';

  const acl = await getGuildAcl(guildId);

  // 2. Bootstrap fallback - nothing configured yet, or everything unbound
  if (acl.roles.length === 0 || acl.bindings.length === 0) {
    return options?.hasManageGuild ? 'allow' : 'deny';
  }

  // 3. Collect matching bindings
  const matchingBindings = acl.bindings.filter((b) => {
    // Must match user by member or discord role
    const matchesUser =
      (b.member !== null && b.member === userId) || (b.role !== null && discordRoleIds.includes(b.role));
    if (!matchesUser) return false;

    // Binding must be server-wide or match the target location
    if (b.locationDomain === null) return true;
    if (!location) return false;
    return b.locationDomain === location.domain && b.locationId === location.id;
  });

  if (matchingBindings.length === 0) return 'deny';

  // 4. Get the matched ACL role IDs
  const matchedRoleIds = new Set(matchingBindings.map((b) => b.aclRole));

  // Build a priority map for the matched roles
  const rolePriority = new Map<string, number>();
  for (const role of acl.roles) {
    if (matchedRoleIds.has(role.id)) {
      rolePriority.set(role.id, role.priority);
    }
  }

  // 5. Collect relevant grants
  const relevantGrants = acl.grants.filter((g) => {
    if (!matchedRoleIds.has(g.aclRole)) return false;
    if (g.permission !== permission) return false;

    // Server-wide grant always relevant
    if (g.locationDomain === null) return true;
    // Location-specific grant must match target
    if (!location) return false;
    return g.locationDomain === location.domain && g.locationId === location.id;
  });

  if (relevantGrants.length === 0) return 'deny';

  // 6. Resolve: deny always wins
  if (relevantGrants.some((g) => g.decision === 'deny')) {
    return 'deny';
  }

  // Among allows, any explicit allow is sufficient
  if (relevantGrants.some((g) => g.decision === 'allow')) {
    return 'allow';
  }

  return 'deny';
};

/**
 * Convenience wrapper: returns true if the user has the given permission.
 */
export const hasPermission = async (
  guildId: bigint,
  userId: bigint,
  discordRoleIds: bigint[],
  permission: Permission,
  location?: AclLocation,
  options?: { isOwner?: boolean; hasManageGuild?: boolean },
): Promise<boolean> => {
  const result = await resolvePermission(guildId, userId, discordRoleIds, permission, location, options);
  return result === 'allow';
};
