/**
 * Permission constants organized by domain.
 * Each permission is a `domain.action` string.
 */
export const Permissions = {
  Server: {
    Manage: 'server.manage',
    Permissions: 'server.permissions',
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
  },
} as const;

type PermissionValues<T> = T extends Record<string, infer V> ? (V extends string ? V : PermissionValues<V>) : never;

export type Permission = PermissionValues<typeof Permissions>;

/**
 * Flat list of all registered permissions, grouped by domain.
 * Used by the grants editor to render the permission matrix.
 */
export const PermissionsByDomain: Record<string, { permission: Permission; label: string }[]> = {
  Server: [
    { permission: Permissions.Server.Manage, label: 'Manage Server' },
    { permission: Permissions.Server.Permissions, label: 'Manage Permissions' },
  ],
  Queue: [
    { permission: Permissions.Queue.Create, label: 'Create Queues' },
    { permission: Permissions.Queue.Edit, label: 'Edit Queues' },
    { permission: Permissions.Queue.Delete, label: 'Delete Queues' },
    { permission: Permissions.Queue.ManageEntries, label: 'Manage Entries' },
  ],
  Game: [
    { permission: Permissions.Game.Create, label: 'Create Games' },
    { permission: Permissions.Game.Manage, label: 'Manage Games' },
  ],
};

/**
 * Flat list of all permissions for iteration.
 */
export const AllPermissions: Permission[] = Object.values(PermissionsByDomain).flatMap((perms) =>
  perms.map((p) => p.permission),
);
