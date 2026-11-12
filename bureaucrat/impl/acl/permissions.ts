/**
 * What the bot gates, as `domain.action` strings. The archetypes
 * (`archetypes.ts`) decide who holds which; call sites name the action.
 */
export const Permissions = {
  Server: {
    Manage: 'server.manage',
  },
  Queue: {
    Create: 'queue.create',
    Edit: 'queue.edit',
    Delete: 'queue.delete',
    ManageEntries: 'queue.manage_entries',
  },
  Game: {
    Create: 'game.create',
    Manage: 'game.manage',
    /** Archive, export or copy offsite an ended game someone else made. */
    Archive: 'game.archive',
  },
} as const;

type PermissionValues<T> = T extends Record<string, infer V> ? (V extends string ? V : PermissionValues<V>) : never;

export type Permission = PermissionValues<typeof Permissions>;

/**
 * A Moderator's share: run any game and help its Storytellers, tend any
 * queue's entries, start a game by hand, file one away. Never the server's
 * configuration or the queues themselves.
 */
export const MODERATOR_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permissions.Game.Create,
  Permissions.Game.Manage,
  Permissions.Game.Archive,
  Permissions.Queue.ManageEntries,
]);
