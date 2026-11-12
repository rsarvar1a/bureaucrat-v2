import { test, expect } from 'bun:test';
import { archetypesOf, decide, meetsGate, type AccessConfig } from '../../../impl/acl/archetypes';
import { MODERATOR_PERMISSIONS, Permissions, type Permission } from '../../../impl/acl/permissions';

const MANAGER = 1n;
const MODERATOR = 2n;
const OTHER = 3n;
const config: AccessConfig = { manager: [MANAGER], moderator: [MODERATOR], storyteller: [], player: [] };
const none = { owner: false, manageGuild: false };

const ALL: Permission[] = Object.values(Permissions).flatMap((domain) => Object.values(domain));

test('the owner, Manage Server and a Manager role each make a Manager, who may do anything', () => {
  for (const archetypes of [
    archetypesOf([], config, { owner: true, manageGuild: false }),
    archetypesOf([], config, { owner: false, manageGuild: true }),
    archetypesOf([MANAGER], config, none),
  ]) {
    expect(archetypes.manager).toBe(true);
    for (const permission of ALL) expect(decide(permission, archetypes), permission).toBe(true);
  }
});

test('Manage Server counts even when Manager roles are configured', () => {
  expect(archetypesOf([OTHER], config, { owner: false, manageGuild: true }).manager).toBe(true);
});

test('a Moderator holds exactly the moderator permissions', () => {
  const archetypes = archetypesOf([MODERATOR], config, none);
  expect(archetypes).toEqual({ manager: false, moderator: true });
  for (const permission of ALL)
    expect(decide(permission, archetypes), permission).toBe(MODERATOR_PERMISSIONS.has(permission));
});

test('a Moderator may not touch configuration or the queues themselves', () => {
  const archetypes = archetypesOf([MODERATOR], config, none);
  for (const permission of [
    Permissions.Server.Manage,
    Permissions.Queue.Create,
    Permissions.Queue.Edit,
    Permissions.Queue.Delete,
  ]) {
    expect(decide(permission, archetypes), permission).toBe(false);
  }
});

test('anyone else holds nothing, and so does everyone when nothing is configured', () => {
  const empty: AccessConfig = { manager: [], moderator: [], storyteller: [], player: [] };
  for (const archetypes of [archetypesOf([OTHER], config, none), archetypesOf([OTHER], empty, none)]) {
    for (const permission of ALL) expect(decide(permission, archetypes), permission).toBe(false);
  }
});

test('a gate with no roles asks nothing; a gate with roles needs one of them', () => {
  expect(meetsGate([], [])).toBe(true);
  expect(meetsGate([OTHER], [MANAGER, MODERATOR])).toBe(false);
  expect(meetsGate([MODERATOR], [MANAGER, MODERATOR])).toBe(true);
});

test("a queue's gate is met as well as the server's, never instead of it", () => {
  const server = [1n];
  const queue = [2n];
  expect(meetsGate([1n, 2n], server, queue)).toBe(true);
  expect(meetsGate([1n], server, queue)).toBe(false);
  expect(meetsGate([2n], server, queue)).toBe(false);
  expect(meetsGate([2n], [], queue)).toBe(true);
  expect(meetsGate([1n], server, [])).toBe(true);
});
