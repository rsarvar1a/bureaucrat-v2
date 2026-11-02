import { test, expect } from 'bun:test';
import { threadKindsForRole } from '../../../impl/discord/games/membership';

test('a Storyteller is in everything, a Kibitzer in kibitz, a Player in nothing by role', () => {
  expect(threadKindsForRole('Storyteller')).toEqual([
    'storyteller',
    'config',
    'kibitz',
    'ST thread',
    'whisper',
    'reveal',
    'reactions',
  ]);
  expect(threadKindsForRole('Kibitzer')).toEqual(['kibitz']);
  expect(threadKindsForRole('Player')).toEqual([]);
});
