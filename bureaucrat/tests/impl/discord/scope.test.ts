import { test, expect } from 'bun:test';
import { inSameGuild } from '../../../impl/discord/guards/scope';
import { S } from '../../../strings';

const HOME = 111111111111111111n;
const AWAY = '222222222222222222';

test('a record from this guild passes', () => {
  expect(inSameGuild(HOME, HOME.toString())).toBe(true);
});

test('a record from another guild does not', () => {
  // The case that matters: a customId carries a view uuid, the view carries a
  // queue, and nothing in that chain mentions a guild. Lifted from one server
  // and replayed in another it would resolve perfectly well.
  expect(inSameGuild(HOME, AWAY)).toBe(false);
});

test('no guild at all is not the same guild', () => {
  // A guard can run before `inGuild` in a per-action array, so this has to be
  // false rather than a throw on BigInt(null).
  expect(inSameGuild(HOME, null)).toBe(false);
  expect(inSameGuild(HOME, undefined)).toBe(false);
  expect(inSameGuild(HOME, '')).toBe(false);
});

test('the comparison survives the string/bigint boundary', () => {
  // `interaction.guildId` is a string and the column is a bigint; comparing
  // them without the conversion is always false and would lock everyone out.
  expect(inSameGuild(9007199254740993n, '9007199254740993')).toBe(true);
});

test('the refusal reveals nothing about the other guild', () => {
  expect(S.errors.notHere).not.toMatch(/guild|server/i);
});
