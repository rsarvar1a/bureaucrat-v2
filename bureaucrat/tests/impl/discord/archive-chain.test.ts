import { test, expect } from 'bun:test';
import {
  categoriesNeeded,
  chainLinks,
  chainName,
  parseChainName,
  planReflow,
} from '../../../impl/discord/games/archives/chain';

test('a chain name is a base and a number; the seed has no number', () => {
  expect(parseChainName('Archives 2')).toEqual({ base: 'Archives', num: 2 });
  expect(parseChainName('Hall of Fame 10')).toEqual({ base: 'Hall of Fame', num: 10 });
  expect(parseChainName('Archives')).toEqual({ base: 'Archives', num: null });
  expect(parseChainName('  Archives 3  ')).toEqual({ base: 'Archives', num: 3 });
  expect(parseChainName('Season 2024')).toEqual({ base: 'Season', num: 2024 });
  expect(chainName('Archives', 2)).toBe('Archives 2');
});

test('the links of a chain are the categories of its base, numbered and sorted; a seed counts as 1 unless 1 exists', () => {
  const cats = [{ name: 'Archives 2' }, { name: 'Other' }, { name: 'Archives' }, { name: 'Archives 10' }];
  expect(chainLinks(cats, 'Archives').map((l) => [l.item.name, l.num])).toEqual([
    ['Archives', 1],
    ['Archives 2', 2],
    ['Archives 10', 10],
  ]);
  const withOne = [{ name: 'Archives 1' }, { name: 'Archives' }];
  expect(chainLinks(withOne, 'Archives').map((l) => l.item.name)).toEqual(['Archives 1']);
  expect(chainLinks(cats, 'Nothing')).toEqual([]);
});

test('a reflow needs enough categories for every channel, and at least one', () => {
  expect(categoriesNeeded(0, 50)).toBe(1);
  expect(categoriesNeeded(50, 50)).toBe(1);
  expect(categoriesNeeded(51, 50)).toBe(2);
  expect(categoriesNeeded(101, 50)).toBe(3);
});

test('a reflow fills the chain oldest-first from 1, newest at the top of each, and orders the categories top-down', () => {
  const links = [
    { item: { id: 'c1', position: 7 }, num: 1 },
    { item: { id: 'c2', position: 3 }, num: 2 },
  ];
  const day = (d: number) => ({ id: `ch${d}`, stamp: new Date(Date.UTC(2026, 0, d)) });
  const { placements, categories } = planReflow(links, [day(5), day(1), day(3), day(2), day(4)], 3);
  expect(placements).toEqual([
    { channel: 'ch3', parent: 'c1', position: 0 },
    { channel: 'ch2', parent: 'c1', position: 1 },
    { channel: 'ch1', parent: 'c1', position: 2 },
    { channel: 'ch5', parent: 'c2', position: 0 },
    { channel: 'ch4', parent: 'c2', position: 1 },
  ]);
  // The chain keeps the slots it had, with the highest number in the topmost.
  expect(categories).toEqual([
    { id: 'c2', position: 3 },
    { id: 'c1', position: 7 },
  ]);
});
