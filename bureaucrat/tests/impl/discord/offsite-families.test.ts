import { describe, expect, test } from 'bun:test';
import { familyOf, overlaps, reusableDestination } from '../../../impl/discord/games/offsite/families';

const families = [
  { source: 'archives', links: ['10', '11', '12'] },
  { source: 'hof', links: ['20'] },
];

describe('familyOf', () => {
  test('finds the family holding the channel’s parent', () => {
    expect(familyOf(families, ['11'])).toBe('archives');
    expect(familyOf(families, ['20'])).toBe('hof');
  });

  test('falls back to the filing category when the parent is unmapped', () => {
    expect(familyOf(families, ['99', '12'])).toBe('archives');
    expect(familyOf(families, [null, '20'])).toBe('hof');
  });

  test('the parent wins over the filing category', () => {
    expect(familyOf(families, ['20', '10'])).toBe('hof');
  });

  test('null when nothing is mapped', () => {
    expect(familyOf(families, ['99', undefined, null])).toBeNull();
    expect(familyOf([], ['10'])).toBeNull();
  });
});

describe('overlaps', () => {
  test('a chain sharing any link is already mapped', () => {
    expect(overlaps(families, ['30', '12'])).toBe(true);
    expect(overlaps(families, ['30', '31'])).toBe(false);
  });
});

describe('reusableDestination', () => {
  const a = { id: 'a', destGuild: 1n };
  const b = { id: 'b', destGuild: 2n };
  const destinations = [
    { destination: a, links: ['100', '101'] },
    { destination: b, links: ['200'] },
  ];

  test('the same server and a category in its chain is the same destination', () => {
    expect(reusableDestination(destinations, 1n, '101')).toBe(a);
    expect(reusableDestination(destinations, 2n, '200')).toBe(b);
  });

  test('another server or another chain is a new one', () => {
    expect(reusableDestination(destinations, 2n, '101')).toBeNull();
    expect(reusableDestination(destinations, 1n, '300')).toBeNull();
  });
});
