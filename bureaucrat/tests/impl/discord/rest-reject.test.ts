import { expect, test } from 'bun:test';
import { REST } from 'discord.js';
import { rejectOnRateLimit, rejectingRateLimits, waitOf } from '../../../impl/discord/rest/reject';

/** A network that answers 429 (retry after `seconds`) the first time per path, then 200. */
const network = (seconds: Record<string, number>) => {
  const seen = new Set<string>();
  return async (url: string): Promise<Response> => {
    const path = new URL(url).pathname;
    if (!seen.has(path)) {
      seen.add(path);
      const wait = Object.entries(seconds).find(([key]) => path.includes(key))?.[1] ?? 0;
      return new Response(
        JSON.stringify({ message: 'You are being rate limited.', retry_after: wait, global: false }),
        {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': String(wait), 'x-ratelimit-scope': 'shared' },
        },
      );
    }
    return new Response(JSON.stringify({ id: '1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
};

const restWith = (seconds: Record<string, number>) =>
  new REST({ rejectOnRateLimit, retries: 0, makeRequest: network(seconds) as never }).setToken('t');

test('inside the scope a long limit throws at once; outside, a caller waits as ever', async () => {
  const rest = restWith({ '/channels/100/threads': 300, '/channels/200/threads': 0.05 });
  const started = Date.now();
  const [scoped, unscoped] = await Promise.allSettled([
    rejectingRateLimits(10_000, () => rest.post('/channels/100/threads', { body: {} })),
    rest.post('/channels/200/threads', { body: {} }),
  ]);
  expect(scoped.status).toBe('rejected');
  expect((scoped as PromiseRejectedResult).reason.name).toStartWith('RateLimitError');
  expect(unscoped.status).toBe('fulfilled');
  expect(Date.now() - started).toBeLessThan(5_000);
});

test('a limit shorter than the patience is waited out even inside the scope', async () => {
  const rest = restWith({ '/channels/300/threads': 0.05 });
  await expect(rejectingRateLimits(10_000, () => rest.post('/channels/300/threads', { body: {} }))).resolves.toEqual({
    id: '1',
  });
});

test('the wait is the longest of the timers', () => {
  expect(waitOf({ timeToReset: 10, retryAfter: 300_000, sublimitTimeout: 0 })).toBe(300_000);
  expect(waitOf({ timeToReset: 40_000, retryAfter: 0, sublimitTimeout: 5 })).toBe(40_000);
});
