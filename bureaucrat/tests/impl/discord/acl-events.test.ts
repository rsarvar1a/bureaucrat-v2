import { test, expect } from 'bun:test';
import { resolveEventTemplate } from '../../../engine/discord/views/notify';
import { AclEvents, aclEvents } from '../../../impl/discord/views/acl/events';

const GUILD = '1226316580280078418';

// The ids map every ACL view sees: `aclroles` is the root panel's route, and
// its entityId is the guild. There is no `guild` key, which is why the
// templates must not use one.
const IDS = { aclroles: GUILD };

test('the template form and the concrete form name the same channel', () => {
  for (const key of Object.keys(AclEvents) as (keyof typeof AclEvents)[]) {
    expect(resolveEventTemplate(AclEvents[key], IDS), key).toBe(aclEvents(GUILD)[key]);
  }
});

test('the concrete form accepts a bigint guild', () => {
  expect(aclEvents(BigInt(GUILD)).RolesChanged).toBe(aclEvents(GUILD).RolesChanged);
});

test('a template with no aclroles ancestor throws rather than resolving to garbage', () => {
  // This is the bug the two-form pattern exists to make visible: the old
  // templates used `${guild}`, which nothing in ancestry ever supplied.
  expect(() => resolveEventTemplate(AclEvents.RolesChanged, {})).toThrow(/aclroles/);
});

test('the three channels are distinct', () => {
  const labels = Object.values(aclEvents(GUILD));
  expect(new Set(labels).size).toBe(labels.length);
});
