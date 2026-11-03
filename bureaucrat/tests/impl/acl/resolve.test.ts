import { test, expect, beforeEach, mock } from 'bun:test';
import { resolvePermission, hasPermission } from '../../../impl/acl/resolve';
import { Permissions } from '../../../impl/acl/permissions';
import type { GuildAclData } from '../../../impl/acl/cache';

// Mock the cache module
const mockAclData: { current: GuildAclData } = {
  current: { roles: [], bindings: [], grants: [], loadedAt: Date.now() },
};

mock.module('../../../impl/acl/cache', () => ({
  getGuildAcl: async () => mockAclData.current,
  invalidateGuildAcl: () => {},
}));

const GUILD = 1000n;
const USER = 2000n;
const DISCORD_ROLE_A = 3000n;
const DISCORD_ROLE_B = 3001n;

const makeRole = (id: string, priority: number) => ({
  id,
  guild: GUILD,
  name: id,
  priority,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeBinding = (
  aclRole: string,
  opts: { role?: bigint; member?: bigint; locationDomain?: string; locationId?: string },
) => ({
  id: crypto.randomUUID(),
  aclRole,
  role: opts.role ?? null,
  member: opts.member ?? null,
  locationDomain: opts.locationDomain ?? null,
  locationId: opts.locationId ?? null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeGrant = (
  aclRole: string,
  permission: string,
  decision: 'allow' | 'deny',
  opts?: { locationDomain?: string; locationId?: string },
) => ({
  id: crypto.randomUUID(),
  aclRole,
  permission,
  decision,
  locationDomain: opts?.locationDomain ?? null,
  locationId: opts?.locationId ?? null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeEach(() => {
  mockAclData.current = { roles: [], bindings: [], grants: [], loadedAt: Date.now() };
});

test('owner bypass always allows', async () => {
  const result = await resolvePermission(GUILD, USER, [], Permissions.Queue.Delete, undefined, { isOwner: true });
  expect(result).toBe('allow');
});

test('bootstrap fallback: no roles + ManageGuild = allow', async () => {
  const result = await resolvePermission(GUILD, USER, [], Permissions.Queue.Edit, undefined, { hasManageGuild: true });
  expect(result).toBe('allow');
});

test('bootstrap fallback: no roles + no ManageGuild = deny', async () => {
  const result = await resolvePermission(GUILD, USER, [], Permissions.Queue.Edit);
  expect(result).toBe('deny');
});

test('no matching bindings = deny', async () => {
  const role = makeRole('admin', 100);
  mockAclData.current = {
    roles: [role],
    bindings: [makeBinding(role.id, { role: 9999n })], // different discord role
    grants: [makeGrant(role.id, Permissions.Queue.Edit, 'allow')],
    loadedAt: Date.now(),
  };

  const result = await resolvePermission(GUILD, USER, [DISCORD_ROLE_A], Permissions.Queue.Edit);
  expect(result).toBe('deny');
});

test('discord role binding with allow grant = allow', async () => {
  const role = makeRole('admin', 100);
  mockAclData.current = {
    roles: [role],
    bindings: [makeBinding(role.id, { role: DISCORD_ROLE_A })],
    grants: [makeGrant(role.id, Permissions.Queue.Edit, 'allow')],
    loadedAt: Date.now(),
  };

  const result = await resolvePermission(GUILD, USER, [DISCORD_ROLE_A], Permissions.Queue.Edit);
  expect(result).toBe('allow');
});

test('member binding with allow grant = allow', async () => {
  const role = makeRole('admin', 100);
  mockAclData.current = {
    roles: [role],
    bindings: [makeBinding(role.id, { member: USER })],
    grants: [makeGrant(role.id, Permissions.Queue.Edit, 'allow')],
    loadedAt: Date.now(),
  };

  const result = await resolvePermission(GUILD, USER, [], Permissions.Queue.Edit);
  expect(result).toBe('allow');
});

test('deny always wins over allow from different role', async () => {
  const admin = makeRole('admin', 100);
  const restricted = makeRole('restricted', 50);

  mockAclData.current = {
    roles: [admin, restricted],
    bindings: [makeBinding(admin.id, { role: DISCORD_ROLE_A }), makeBinding(restricted.id, { role: DISCORD_ROLE_B })],
    grants: [
      makeGrant(admin.id, Permissions.Queue.Delete, 'allow'),
      makeGrant(restricted.id, Permissions.Queue.Delete, 'deny'),
    ],
    loadedAt: Date.now(),
  };

  // User has both roles — deny wins even though admin has higher priority
  const result = await resolvePermission(GUILD, USER, [DISCORD_ROLE_A, DISCORD_ROLE_B], Permissions.Queue.Delete);
  expect(result).toBe('deny');
});

test('location-scoped binding restricts to that location', async () => {
  const maintainer = makeRole('maintainer', 10);
  const queueId = 'queue-123';

  mockAclData.current = {
    roles: [maintainer],
    bindings: [makeBinding(maintainer.id, { member: USER, locationDomain: 'queue', locationId: queueId })],
    grants: [makeGrant(maintainer.id, Permissions.Queue.Edit, 'allow')],
    loadedAt: Date.now(),
  };

  // Allowed on the specific queue
  const allowed = await resolvePermission(GUILD, USER, [], Permissions.Queue.Edit, { domain: 'queue', id: queueId });
  expect(allowed).toBe('allow');

  // Not allowed on a different queue (binding doesn't match)
  const denied = await resolvePermission(GUILD, USER, [], Permissions.Queue.Edit, {
    domain: 'queue',
    id: 'other-queue',
  });
  expect(denied).toBe('deny');
});

test('no grants for matching permission = deny', async () => {
  const role = makeRole('admin', 100);
  mockAclData.current = {
    roles: [role],
    bindings: [makeBinding(role.id, { member: USER })],
    grants: [makeGrant(role.id, Permissions.Queue.Edit, 'allow')], // only edit, not delete
    loadedAt: Date.now(),
  };

  const result = await resolvePermission(GUILD, USER, [], Permissions.Queue.Delete);
  expect(result).toBe('deny');
});

test('hasPermission returns boolean', async () => {
  const role = makeRole('admin', 100);
  mockAclData.current = {
    roles: [role],
    bindings: [makeBinding(role.id, { member: USER })],
    grants: [makeGrant(role.id, Permissions.Queue.Edit, 'allow')],
    loadedAt: Date.now(),
  };

  expect(await hasPermission(GUILD, USER, [], Permissions.Queue.Edit)).toBe(true);
  expect(await hasPermission(GUILD, USER, [], Permissions.Queue.Delete)).toBe(false);
});

test('roles with no bindings still admit ManageGuild (nothing can lock a guild out)', async () => {
  // Seeding creates roles before anyone is bound to them, and an admin can
  // later delete every binding. Either way the bootstrap fallback must still
  // be in force, or the only person left able to press anything is the owner.
  const role = makeRole('admin', 100);
  mockAclData.current = {
    roles: [role],
    bindings: [],
    grants: [makeGrant(role.id, Permissions.Queue.Edit, 'allow')],
    loadedAt: Date.now(),
  };

  expect(await resolvePermission(GUILD, USER, [], Permissions.Queue.Edit, undefined, { hasManageGuild: true })).toBe(
    'allow',
  );
  expect(await resolvePermission(GUILD, USER, [], Permissions.Queue.Edit)).toBe('deny');
});
