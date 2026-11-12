import { archetypesOf, decide, type Bypass } from './archetypes';
import { getGuildAccess } from './cache';
import type { Permission } from './permissions';

/** Whether a member of a guild, by their Discord roles, holds `permission`. */
export const resolvePermission = async (
  guild: bigint,
  roles: bigint[],
  permission: Permission,
  bypass: Bypass,
): Promise<boolean> => decide(permission, archetypesOf(roles, await getGuildAccess(guild), bypass));
