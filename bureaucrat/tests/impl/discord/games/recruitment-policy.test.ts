import { test, expect } from 'bun:test';
import { nextRecruitment, recruitCutoff, recruitmentFor } from '../../../../impl/discord/games/recruitment/policy';

const server = { recruitRoles: [1n], recruitCooldown: 48 };

test('a game with no queue, or a queue that sets nothing, recruits as the server does', () => {
  expect(recruitmentFor(server, null)).toEqual({ roles: [1n], cooldownHours: 48 });
  expect(recruitmentFor(server, { recruitRoles: [], recruitCooldown: null })).toEqual({
    roles: [1n],
    cooldownHours: 48,
  });
});

test("a queue's roles and cooldown each replace the server's, never add to them", () => {
  expect(recruitmentFor(server, { recruitRoles: [2n, 3n], recruitCooldown: null })).toEqual({
    roles: [2n, 3n],
    cooldownHours: 48,
  });
  expect(recruitmentFor(server, { recruitRoles: [], recruitCooldown: 12 })).toEqual({ roles: [1n], cooldownHours: 12 });
});

test('a game that never recruited may at once; after, once the cooldown has run', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  expect(nextRecruitment(null, 48)).toBeNull();
  expect(nextRecruitment(now, 48)).toEqual(new Date('2026-11-17T12:00:00Z'));
  expect(recruitCutoff(now, 48)).toEqual(new Date('2026-11-13T12:00:00Z'));
});
