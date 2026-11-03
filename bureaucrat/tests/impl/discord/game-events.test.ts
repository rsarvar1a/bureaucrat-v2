import { test, expect } from 'bun:test';
import { resolveEventTemplate } from '../../../engine/discord/views/notify';
import { GameEvents, gameEvents } from '../../../impl/discord/views/games/events';

const GAME = '0f4c6a2e-5b1d-4d3a-9c8e-1a2b3c4d5e6f';

// The ids map a window sees: the header's route, carrying the game id.
const IDS = { gconfig: GAME };

test('templates and concrete labels name the same channel', () => {
  for (const key of Object.keys(GameEvents) as (keyof typeof GameEvents)[]) {
    expect(resolveEventTemplate(GameEvents[key], IDS), key).toBe(gameEvents(GAME)[key]);
  }
});

test('a window outside the stack cannot resolve them', () => {
  expect(() => resolveEventTemplate(GameEvents.Changed, { queue: GAME })).toThrow(/gconfig/);
});
