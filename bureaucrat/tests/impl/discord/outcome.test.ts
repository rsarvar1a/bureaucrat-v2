import { test, expect } from 'bun:test';
import { defaultWinners, sideOf, winnersFrom } from '../../../impl/discord/games/outcome';
import { teamLookup } from '../../../impl/discord/games/script/alignment';
import type { SeatedPlayer } from '../../../drizzle/seating';

const teamOf = teamLookup(null);

const seat = (n: number, trueRole: string | null, over: Partial<SeatedPlayer['seat']> = {}): SeatedPlayer => ({
  member: BigInt(100 + n),
  seat: {
    id: `s${n}`,
    game: 'g',
    player: `p${n}`,
    seat: n,
    nickname: null,
    state: 'alive',
    traveler: false,
    trueRole,
    trueAlignment: null,
    apparentRole: null,
    apparentAlignment: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as SeatedPlayer['seat'],
});

test('a seat is on the side of its true role unless the Storyteller overrode it', () => {
  expect(sideOf(seat(1, 'Chef').seat, teamOf)).toBe('good');
  expect(sideOf(seat(2, 'Imp').seat, teamOf)).toBe('evil');
  expect(sideOf(seat(3, 'Chef', { trueAlignment: 'evil' }).seat, teamOf)).toBe('evil');
  expect(sideOf(seat(4, 'Beggar').seat, teamOf)).toBeNull();
  expect(sideOf(seat(5, null).seat, teamOf)).toBeNull();
});

test('a declared winner preselects everyone on that side and nobody else', () => {
  const rows = [seat(1, 'Chef'), seat(2, 'Imp'), seat(3, 'Poisoner', { trueAlignment: 'good' }), seat(4, 'Beggar')];
  expect(defaultWinners(rows, 'good', teamOf)).toEqual(['s1', 's3']);
  expect(defaultWinners(rows, 'evil', teamOf)).toEqual(['s2']);
});

test('an empty seat is never a winner', () => {
  const empty = { ...seat(1, 'Chef'), member: null };
  expect(defaultWinners([empty], 'good', teamOf)).toEqual([]);
  expect(winnersFrom([empty], ['s1'], teamOf)).toEqual([]);
});

test('the record freezes the role and side of each picked seat', () => {
  const rows = [seat(1, 'Chef'), seat(2, 'Imp'), seat(4, 'Beggar')];
  expect(winnersFrom(rows, ['s2', 's4'], teamOf)).toEqual([
    { participant: 'p2', member: 102n, role: 'Imp', alignment: 'evil' },
    { participant: 'p4', member: 104n, role: 'Beggar', alignment: null },
  ]);
});
