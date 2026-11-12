import { MODERATOR_PERMISSIONS, type Permission } from './permissions';

/**
 * Who may do what, as four archetypes bound to Discord roles.
 *
 * Managers stand in for Manage Server: they may do anything, and so may the
 * owner and anyone Discord already gives Manage Server or Administrator,
 * whatever is configured, so no setting can lock a server out of its own bot.
 * Moderators hold `MODERATOR_PERMISSIONS`. Storyteller and Player are gates,
 * not permissions: when roles are set, one is needed to join as one, and a
 * queue may require one of its own on top.
 *
 * Import-free beyond the catalogue, so it is tested exhaustively.
 */
export type AccessConfig = { manager: bigint[]; moderator: bigint[]; storyteller: bigint[]; player: bigint[] };

export type Bypass = { owner: boolean; manageGuild: boolean };

export type Archetypes = { manager: boolean; moderator: boolean };

const holdsAny = (held: readonly bigint[], wanted: readonly bigint[]): boolean =>
  wanted.some((role) => held.includes(role));

export const archetypesOf = (held: readonly bigint[], config: AccessConfig, bypass: Bypass): Archetypes => ({
  manager: bypass.owner || bypass.manageGuild || holdsAny(held, config.manager),
  moderator: holdsAny(held, config.moderator),
});

export const decide = (permission: Permission, archetypes: Archetypes): boolean =>
  archetypes.manager || (archetypes.moderator && MODERATOR_PERMISSIONS.has(permission));

/** Every list that is set must be met: the server's, then the queue's. An empty list asks nothing. */
export const meetsGate = (held: readonly bigint[], ...lists: (readonly bigint[])[]): boolean =>
  lists.every((list) => list.length === 0 || holdsAny(held, list));
