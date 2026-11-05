import { expect, test } from 'bun:test';
import { Deferred, ThreadGate } from '../../../impl/discord/games/offsite/gate';

const limited = (wait: number) =>
  Object.assign(new Error(''), {
    name: 'RateLimitError[/channels/:id/threads]',
    timeToReset: 0,
    retryAfter: wait,
    sublimitTimeout: 0,
  });

test('a thread limit becomes a deferral to when it lifts', async () => {
  const now = 1_000_000;
  const gate = new ThreadGate(() => now);
  const error = await gate.create('guild', () => Promise.reject(limited(300_000))).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(Deferred);
  expect((error as Deferred).until.getTime()).toBe(1_300_000);
});

test('while the window is shut, later writers defer without asking Discord', async () => {
  let now = 0;
  const gate = new ThreadGate(() => now);
  await gate.create('guild', () => Promise.reject(limited(60_000))).catch(() => undefined);

  let asked = 0;
  const make = () => {
    asked += 1;
    return Promise.resolve('thread');
  };
  await expect(gate.create('guild', make)).rejects.toBeInstanceOf(Deferred);
  expect(asked).toBe(0);
  // Another server's window is its own.
  expect(await gate.create('elsewhere', make)).toBe('thread');

  now = 60_000;
  expect(gate.opensAt('guild')).toBeNull();
  expect(await gate.create('guild', make)).toBe('thread');
  expect(asked).toBe(2);
});

test('anything but a rate limit passes through untouched', async () => {
  const gate = new ThreadGate(() => 0);
  await expect(gate.create('guild', () => Promise.reject(new Error('Missing Access')))).rejects.toThrow(
    'Missing Access',
  );
  expect(gate.opensAt('guild')).toBeNull();
});
