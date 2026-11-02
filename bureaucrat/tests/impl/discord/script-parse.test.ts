import { test, expect } from 'bun:test';
import { normalizeId, OFFICIAL } from '../../../impl/discord/games/script/characters';
import { byTeam, pageCount, pageOf, parseScript } from '../../../impl/discord/games/script/parse';

test('every official id is normalised and every name is unique', () => {
  const ids = Object.keys(OFFICIAL);
  for (const id of ids) expect(normalizeId(id)).toBe(id);
  expect(new Set(Object.values(OFFICIAL).map((c) => c.name)).size).toBe(ids.length);
  expect(OFFICIAL['fortuneteller']?.name).toBe('Fortune Teller');
  expect(OFFICIAL['lilmonsta']?.team).toBe('demon');
});

test('string ids resolve to the official name and team', () => {
  const result = parseScript(['washerwoman', 'imp']);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.script.characters).toEqual([
    { id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk' },
    { id: 'imp', name: 'Imp', team: 'demon' },
  ]);
});

test('an unknown id keeps the id as its name', () => {
  const result = parseScript(['mysteryman']);
  if (!result.ok) throw new Error(result.reason);
  expect(result.script.characters[0]).toEqual({ id: 'mysteryman', name: 'mysteryman', team: 'unknown' });
});

test('object entries carry their own name and team, and _meta is not a character', () => {
  const result = parseScript([
    { id: '_meta', name: 'My Script', author: 'Me' },
    { id: 'custom_hero', name: 'Custom Hero', team: 'Townsfolk' },
    { id: 'Fortune_Teller' },
    { id: 'wanderer', team: 'traveller' },
  ]);
  if (!result.ok) throw new Error(result.reason);
  expect(result.script.name).toBe('My Script');
  expect(result.script.author).toBe('Me');
  expect(result.script.characters.map((c) => [c.id, c.name, c.team])).toEqual([
    ['customhero', 'Custom Hero', 'townsfolk'],
    ['fortuneteller', 'Fortune Teller', 'townsfolk'],
    ['wanderer', 'wanderer', 'traveler'],
  ]);
});

test('duplicates collapse to the first', () => {
  const result = parseScript(['imp', { id: 'imp', name: 'Not the Imp' }]);
  if (!result.ok) throw new Error(result.reason);
  expect(result.script.characters).toHaveLength(1);
  expect(result.script.characters[0]!.name).toBe('Imp');
});

test('a non-array or a garbage entry is refused with its place', () => {
  expect(parseScript({ not: 'a list' })).toEqual({ ok: false, reason: 'Expected a JSON array of characters.' });
  expect(parseScript(['imp', 42])).toEqual({ ok: false, reason: 'Entry 2 is not a character.' });
  expect(parseScript([{ name: 'nameless' }])).toEqual({ ok: false, reason: 'Entry 1 has no id.' });
});

test('characters sort by team, keeping script order within a team', () => {
  const result = parseScript(['imp', 'butler', 'poisoner', 'chef', 'empath']);
  if (!result.ok) throw new Error(result.reason);
  expect(byTeam(result.script.characters).map((c) => c.id)).toEqual(['chef', 'empath', 'butler', 'poisoner', 'imp']);
});

test('paging splits at 25 and clamps the page', () => {
  const items = Array.from({ length: 26 }, (_, i) => i);
  expect(pageCount(25)).toBe(1);
  expect(pageCount(26)).toBe(2);
  expect(pageOf(items, 0)).toHaveLength(25);
  expect(pageOf(items, 1)).toEqual([25]);
  expect(pageOf(items, 9)).toEqual([25]);
  expect(pageOf(items, -3)).toHaveLength(25);
});
