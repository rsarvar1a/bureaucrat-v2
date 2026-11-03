import { test, expect } from 'bun:test';
import { resolveEventTemplate } from '../../../engine/discord/views/notify';
import { OffsiteEvents, offsiteEvents } from '../../../impl/discord/views/games/offsite/events';

const GAME = '0f4c6a2e-5b1d-4d3a-9c8e-1a2b3c4d5e6f';

test('the card template and the engine label name the same channel', () => {
  for (const key of Object.keys(OffsiteEvents) as (keyof typeof OffsiteEvents)[]) {
    expect(resolveEventTemplate(OffsiteEvents[key], { goffsite: GAME }), key).toBe(offsiteEvents(GAME)[key]);
  }
});
