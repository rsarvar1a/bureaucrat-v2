import { test, expect } from 'bun:test';
import { resolveEventTemplate } from '../../../engine/discord/views/notify';
import { QueueEvents, QueueEntryEvents, queueEvents, queueEntryEvents } from '../../../impl/discord/views/queue/events';

const QUEUE = '0f4c6a2e-5b1d-4d3a-9c8e-1a2b3c4d5e6f';
const ENTRY = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

// The ids map an entry panel sees: its own route plus every ancestor's.
const IDS = { queue: QUEUE, qentry: ENTRY };

test('queue templates and concrete labels name the same channel', () => {
  for (const key of Object.keys(QueueEvents) as (keyof typeof QueueEvents)[]) {
    expect(resolveEventTemplate(QueueEvents[key], IDS), key).toBe(queueEvents(QUEUE)[key]);
  }
});

test('entry templates and concrete labels name the same channel', () => {
  for (const key of Object.keys(QueueEntryEvents) as (keyof typeof QueueEntryEvents)[]) {
    expect(resolveEventTemplate(QueueEntryEvents[key], IDS), key).toBe(queueEntryEvents(ENTRY)[key]);
  }
});

test('an entry template needs its own id, not just the queue', () => {
  expect(() => resolveEventTemplate(QueueEntryEvents.SignupsChanged, { queue: QUEUE })).toThrow(/qentry/);
});

test('queue and entry channels never collide', () => {
  const labels = [...Object.values(queueEvents(QUEUE)), ...Object.values(queueEntryEvents(ENTRY))];
  expect(new Set(labels).size).toBe(labels.length);
});
