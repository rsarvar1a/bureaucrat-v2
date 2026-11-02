import { test, expect } from 'bun:test';
import {
  defaultAlignment,
  nextAlignment,
  roleEmoteNames,
  teamLookup,
} from '../../../impl/discord/games/script/alignment';

test('townsfolk and outsiders default good, minions and demons evil, the rest unaligned', () => {
  expect(defaultAlignment('townsfolk')).toBe('good');
  expect(defaultAlignment('outsider')).toBe('good');
  expect(defaultAlignment('minion')).toBe('evil');
  expect(defaultAlignment('demon')).toBe('evil');
  for (const team of ['traveler', 'fabled', 'loric', 'unknown', null] as const)
    expect(defaultAlignment(team)).toBeNull();
});

test('the override cycles default, good, evil', () => {
  expect(nextAlignment(null)).toBe('good');
  expect(nextAlignment('good')).toBe('evil');
  expect(nextAlignment('evil')).toBeNull();
});

test('an aligned role tries its variant icon before the plain name', () => {
  expect(roleEmoteNames('Barista', 'evil')).toEqual(['barista_e', 'barista']);
  expect(roleEmoteNames('Snake Charmer', 'good')).toEqual(['snakecharmer_g', 'snakecharmer']);
  expect(roleEmoteNames('Beggar', null)).toEqual(['beggar']);
});

test('the team of a role comes from the script, then the official list', () => {
  const teamOf = teamLookup([{ id: 'homebrew', name: 'Home Brew', team: 'minion' }]);
  expect(teamOf('Home Brew')).toBe('minion');
  expect(teamOf('homebrew')).toBe('minion');
  expect(teamOf('Imp')).toBe('demon');
  expect(teamOf('Nobody')).toBeNull();
  expect(teamOf(null)).toBeNull();
  expect(teamLookup(null)('Librarian')).toBe('townsfolk');
});
