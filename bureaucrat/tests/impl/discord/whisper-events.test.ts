import { test, expect } from 'bun:test';
import { resolveEventTemplate } from '../../../engine/discord/views/notify';
import { whisperChanged, WhisperEvents } from '../../../impl/discord/views/whispers/events';

const WHISPER = '0f4c6a2e-5b1d-4d3a-9c8e-1a2b3c4d5e6f';

test('both cards hear the one concrete label', () => {
  const concrete = whisperChanged(WHISPER);
  expect(resolveEventTemplate(WhisperEvents.Changed, { gwhisper: WHISPER })).toBe(concrete);
  expect(resolveEventTemplate(WhisperEvents.PromoteChanged, { gwhisperpromote: WHISPER })).toBe(concrete);
});
