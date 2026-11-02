import { test, expect } from 'bun:test';
import { resolveEventTemplate } from '../../../engine/discord/views/notify';
import {
  dayChanged,
  nominationChanged,
  NominationEvents,
  nominationEvents,
} from '../../../impl/discord/views/nominations/events';

const PHASE = '0f4c6a2e-5b1d-4d3a-9c8e-1a2b3c4d5e6f';
const NOMINATION = '9a8b7c6d-5e4f-4a3b-8c9d-0e1f2a3b4c5d';

test('templates and concrete labels name the same channels', () => {
  const ids = { gnomday: PHASE, gnomination: NOMINATION };
  const concrete = nominationEvents({ phase: PHASE, nomination: NOMINATION });
  expect(resolveEventTemplate(NominationEvents.DayChanged, ids)).toBe(concrete.DayChanged!);
  expect(resolveEventTemplate(NominationEvents.Changed, ids)).toBe(concrete.Changed!);
  expect(dayChanged(PHASE)).toBe(concrete.DayChanged!);
  expect(nominationChanged(NOMINATION)).toBe(concrete.Changed!);
});

test('a card without the ids cannot resolve them', () => {
  expect(() => resolveEventTemplate(NominationEvents.DayChanged, { gconfig: PHASE })).toThrow(/gnomday/);
});
