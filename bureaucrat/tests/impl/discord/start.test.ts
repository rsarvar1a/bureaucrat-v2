import { test, expect } from 'bun:test';
import { threadsToCreate } from '../../../impl/discord/games/start';

test('only the planned threads not yet made are created, once each', () => {
  expect(threadsToCreate(['Rules', 'Claims', 'Rules'], ['Claims'])).toEqual(['Rules']);
  // Reverse plan order, so the channel's newest-first list reads as planned.
  expect(threadsToCreate(['Actions', 'Claims', 'Nominations'], [])).toEqual(['Nominations', 'Claims', 'Actions']);
  expect(threadsToCreate(['Rules'], ['Rules'])).toEqual([]);
  expect(threadsToCreate([], [])).toEqual([]);
});
