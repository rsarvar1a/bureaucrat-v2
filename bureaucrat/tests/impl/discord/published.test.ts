import { test, expect } from 'bun:test';
import { isPublished, ownSeat, publishedSquare, snapshot } from '../../../impl/discord/games/published';
import type { SeatedPlayer } from '../../../drizzle/seating';

const seat = (
  n: number,
  over: Partial<SeatedPlayer['seat']> = {},
  member: bigint | null = BigInt(100 + n),
): SeatedPlayer => ({
  member,
  seat: {
    id: `s${n}`,
    game: 'g',
    player: member === null ? null : `p${n}`,
    seat: n,
    nickname: null,
    state: 'alive',
    traveler: false,
    claim: null,
    apparentRole: null,
    apparentAlignment: null,
    claimedRole: null,
    trueRole: null,
    trueAlignment: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  },
});

const live = [seat(1, { trueRole: 'Imp' }), seat(2, { state: 'dead' }), seat(3, {}, null)];
const published = snapshot(live);

test("a snapshot keeps what the square shows and nothing of the row's bookkeeping", () => {
  expect(published[0]).toEqual({
    id: 's1',
    player: 'p1',
    member: '101',
    seat: 1,
    nickname: null,
    state: 'alive',
    traveler: false,
    trueRole: 'Imp',
    trueAlignment: null,
    apparentRole: null,
    apparentAlignment: null,
  });
  expect(published[2]!.member).toBeNull();
});

test('nothing published, nothing shown', () => {
  expect(publishedSquare(null, live, true)).toBeNull();
  expect(isPublished(null, live, true)).toBe(false);
});

test('the square is the publish, not the live seating', () => {
  const later = [seat(1, { trueRole: 'Imp', state: 'dead' }), seat(2, { state: 'dead' }), seat(3, {}, null)];
  const rows = publishedSquare(published, later, false)!;
  expect(rows[0]!.seat.state).toBe('alive');
  expect(rows[0]!.member).toBe(101n);
  expect(isPublished(published, later, false)).toBe(false);
  expect(isPublished(published, live, false)).toBe(true);
});

test('with roles live, roles come through and states do not', () => {
  const later = [
    seat(1, { trueRole: 'Baron', state: 'dead' }),
    seat(2, { state: 'dead', traveler: true }),
    seat(3, {}, null),
  ];
  const rows = publishedSquare(published, later, true)!;
  expect(rows[0]!.seat.trueRole).toBe('Baron');
  expect(rows[0]!.seat.state).toBe('alive');
  expect(rows[1]!.seat.traveler).toBe(true);
  // A role change alone is already visible, so it is not an unpublished change.
  expect(
    isPublished(published, [seat(1, { trueRole: 'Baron' }), seat(2, { state: 'dead' }), seat(3, {}, null)], true),
  ).toBe(true);
  expect(isPublished(published, later, true)).toBe(false);
});

test('seats added since a publish wait for the next one', () => {
  const rows = publishedSquare(published, [...live, seat(4)], true)!;
  expect(rows).toHaveLength(3);
  expect(isPublished(published, [...live, seat(4)], true)).toBe(false);
});

test("a player's own seat follows the same rule", () => {
  const later = [seat(1, { trueRole: 'Baron' }), seat(2, { state: 'dead' }), seat(3, {}, null)];
  expect(ownSeat(published, later, 'p1', false)?.trueRole).toBe('Imp');
  expect(ownSeat(published, later, 'p1', true)?.trueRole).toBe('Baron');
  expect(ownSeat(published, later, 'p4', true)).toBeNull();
  expect(ownSeat(null, later, 'p1', true)?.trueRole).toBe('Baron');
  expect(ownSeat(null, later, 'p1', false)).toBeNull();
});
