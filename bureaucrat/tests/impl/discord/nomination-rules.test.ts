import { test, expect } from 'bun:test';
import {
  blockAfter,
  canNominate,
  kindFor,
  mayVote,
  mayFinalize,
  nextToLock,
  requiredVotes,
  spendsGhostVote,
  statusOf,
  tally,
  voteOrder,
  weightLabel,
  type SeatRef,
} from '../../../impl/discord/games/nominations/rules';

const seat = (id: string, n: number, state: SeatRef['state'] = 'alive', traveler = false): SeatRef => ({
  id,
  seat: n,
  state,
  traveler,
});

// Five seats round the circle: a..e at 1..5, e a traveler.
const TOWN = [seat('a', 1), seat('b', 2), seat('c', 3), seat('d', 4), seat('e', 5, 'alive', true)];

test('the kind follows the dock: nobody is the Storyteller, a traveler is exiled', () => {
  expect(kindFor(null)).toBe('storyteller');
  expect(kindFor(seat('e', 5, 'alive', true))).toBe('exile');
  expect(kindFor(seat('a', 1))).toBe('execution');
});

test('voting starts clockwise of the nominee and ends on them', () => {
  expect(voteOrder(TOWN, 'a', 'c')).toEqual(['d', 'e', 'a', 'b', 'c']);
  expect(voteOrder(TOWN, 'c', 'a')).toEqual(['b', 'c', 'd', 'e', 'a']);
  expect(voteOrder(TOWN, 'a', 'e')).toEqual(['a', 'b', 'c', 'd', 'e']);
});

test('a self-nomination still ends on the nominee, and the Storyteller nominated ends on the accuser', () => {
  expect(voteOrder(TOWN, 'b', 'b')).toEqual(['c', 'd', 'e', 'a', 'b']);
  expect(voteOrder(TOWN, 'd', null)).toEqual(['e', 'a', 'b', 'c', 'd']);
});

test('the order survives gaps in the seat numbers', () => {
  const gapped = [seat('x', 2), seat('y', 7), seat('z', 11)];
  expect(voteOrder(gapped, 'x', 'y')).toEqual(['z', 'x', 'y']);
});

test('an execution needs half the living, an exile half of everyone', () => {
  const town = [seat('a', 1), seat('b', 2, 'dead'), seat('c', 3), seat('d', 4, 'spent'), seat('e', 5)];
  expect(requiredVotes('execution', town)).toBe(2); // 3 alive
  expect(requiredVotes('storyteller', town)).toBe(2);
  expect(requiredVotes('exile', town)).toBe(3); // 5 seated
  expect(requiredVotes('execution', [seat('a', 1), seat('b', 2), seat('c', 3), seat('d', 4)])).toBe(2);
});

const hand = (position: number, locked: boolean, yes: boolean | null = null, weight: number | null = null) => ({
  position,
  locked,
  yes,
  weight,
});

test('the count is open until finalized, and finalizing needs every hand locked', () => {
  const votes = [hand(1, true, true, 1), hand(2, true, true, 1), hand(3, false)];
  expect(tally(votes)).toBe(2);
  expect(statusOf(votes, 2, false)).toBe('open');
  expect(mayFinalize(votes)).toBe(false);
  expect(nextToLock(votes)).toBe(3);

  const thieved = [hand(1, true, true, 1), hand(2, true, true, 1), hand(3, true, true, -1)];
  expect(tally(thieved)).toBe(1);
  expect(mayFinalize(thieved)).toBe(true);
  expect(statusOf(thieved, 2, false)).toBe('open');
  expect(statusOf(thieved, 2, true)).toBe('failed');
  expect(nextToLock(thieved)).toBeNull();

  const bureaucrat = [hand(1, true, true, 3), hand(2, true, false, 0)];
  expect(statusOf(bureaucrat, 3, true)).toBe('passed');
  expect(mayFinalize([])).toBe(false);
});

test('a dead yes spends the ghost vote, except on an exile, where anyone may vote', () => {
  expect(spendsGhostVote('execution', 'dead', true)).toBe(true);
  expect(spendsGhostVote('storyteller', 'dead', true)).toBe(true);
  expect(spendsGhostVote('execution', 'dead', false)).toBe(false);
  expect(spendsGhostVote('execution', 'alive', true)).toBe(false);
  expect(spendsGhostVote('exile', 'dead', true)).toBe(false);

  expect(mayVote('execution', 'spent')).toBe(false);
  expect(mayVote('execution', 'dead')).toBe(true);
  expect(mayVote('exile', 'spent')).toBe(true);
});

test('the block goes to the passing nomination with the most votes; a tie clears it', () => {
  const n = (
    id: string,
    kind: 'execution' | 'exile' | 'storyteller',
    status: 'open' | 'passed' | 'failed',
    t: number,
  ) => ({
    id,
    kind,
    status,
    tally: t,
  });
  expect(blockAfter([n('a', 'execution', 'passed', 3)])).toBe('a');
  expect(blockAfter([n('a', 'execution', 'passed', 3), n('b', 'execution', 'passed', 5)])).toBe('b');
  expect(blockAfter([n('a', 'execution', 'passed', 4), n('b', 'execution', 'passed', 4)])).toBeNull();
  expect(blockAfter([n('a', 'execution', 'passed', 3), n('b', 'exile', 'passed', 9)])).toBe('a');
  expect(blockAfter([n('a', 'execution', 'failed', 1), n('b', 'execution', 'open', 9)])).toBeNull();
  expect(blockAfter([n('a', 'execution', 'passed', 3), n('s', 'storyteller', 'passed', 4)])).toBe('s');
  expect(blockAfter([])).toBeNull();
});

test('the dead nominate nobody; otherwise once a day each way, exiles aside', () => {
  const [a, b, c, , e] = TOWN as [SeatRef, SeatRef, SeatRef, SeatRef, SeatRef];
  expect(canNominate(seat('x', 9, 'dead'), b, [], true)).toBe('notAlive');
  expect(canNominate(a, b, [], false)).toBe(true);
  expect(canNominate(a, a, [], false)).toBe(true);

  const today = [{ kind: 'execution' as const, plaintiff: 'a', defendant: 'b' }];
  expect(canNominate(a, c, today, false)).toBe('alreadyNominated');
  expect(canNominate(c, b, today, false)).toBe('alreadyNominee');
  expect(canNominate(a, e, today, false)).toBe(true); // an exile costs nothing
  expect(canNominate(c, e, [{ kind: 'exile', plaintiff: 'a', defendant: 'e' }], false)).toBe(true);
  expect(canNominate(c, b, [{ kind: 'exile', plaintiff: 'c', defendant: 'e' }], false)).toBe(true);
});

test('the Storyteller is nominated only when allowed, and once', () => {
  const [a, , c] = TOWN as [SeatRef, SeatRef, SeatRef];
  expect(canNominate(a, null, [], false)).toBe('storytellerOff');
  expect(canNominate(a, null, [], true)).toBe(true);
  const today = [{ kind: 'storyteller' as const, plaintiff: 'a', defendant: null }];
  expect(canNominate(c, null, today, true)).toBe('alreadyNominee');
  expect(canNominate(a, c, today, true)).toBe('alreadyNominated');
});

test('a weight is written only when it is not one', () => {
  expect(weightLabel(1)).toBe('');
  expect(weightLabel(null)).toBe('');
  expect(weightLabel(3)).toBe('×3');
  expect(weightLabel(-1)).toBe('−1');
  expect(weightLabel(0)).toBe('×0');
});
