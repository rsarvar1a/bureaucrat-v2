import { expect, test } from 'bun:test';
import { DiscordAPIError, RateLimitError } from 'discord.js';
import { classify, routeOf, scrub } from '../../../impl/discord/errors/classify';

const API = 'https://discord.com/api/v10';

test('routes lose their ids, emoji and query', () => {
  expect(routeOf('get', `${API}/channels/123456789012345678/messages?limit=100&before=123456789012345679`)).toBe(
    'GET /channels/:id/messages',
  );
  expect(routeOf('GET', `${API}/channels/123456789012345678/messages/223456789012345678/reactions/%E2%9C%85`)).toBe(
    'GET /channels/:id/messages/:id/reactions/:emoji',
  );
});

test('a webhook token never survives into a route or a message', () => {
  const url = `${API}/webhooks/123456789012345678/AbC-dEf_123.xyz?thread_id=223456789012345678&wait=true`;
  expect(routeOf('POST', url)).toBe('POST /webhooks/:id/:token');
  expect(scrub(`failed at ${url}`)).not.toContain('AbC-dEf_123.xyz');
});

test('a Discord refusal is kind, code, status and route', () => {
  const error = new DiscordAPIError(
    { code: 50001, message: 'Missing Access' },
    50001,
    403,
    'GET',
    `${API}/channels/123456789012345678/messages`,
    {},
  );
  expect(classify(error)).toEqual({
    kind: 'discord',
    code: '50001',
    status: 403,
    route: 'GET /channels/:id/messages',
    message: 'Missing Access',
  });
});

test('a rate limit says whether it was global', () => {
  const error = new RateLimitError({
    timeToReset: 1000,
    limit: 5,
    method: 'POST',
    hash: 'h',
    url: `${API}/webhooks/123456789012345678/secret-token`,
    route: '/webhooks/:id',
    majorParameter: '123456789012345678',
    global: true,
    retryAfter: 1000,
    sublimitTimeout: 0,
    scope: 'global',
  });
  const classified = classify(error);
  expect(classified).toMatchObject({
    kind: 'rate-limit',
    code: 'global',
    status: 429,
    route: 'POST /webhooks/:id/:token',
  });
  expect(classified.message).not.toContain('secret-token');
});

test('network, database and anything else', () => {
  const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  expect(classify(reset)).toMatchObject({ kind: 'network', code: 'ECONNRESET' });
  const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
  expect(classify(abort)).toMatchObject({ kind: 'network', code: 'AbortError' });
  const pg = Object.assign(new Error('deadlock detected'), { name: 'PostgresError', code: '40P01', severity: 'ERROR' });
  expect(classify(pg)).toMatchObject({ kind: 'database', code: '40P01' });
  expect(classify(new Error('boom'))).toMatchObject({ kind: 'other', code: null, route: null });
  expect(classify('a string')).toMatchObject({ kind: 'other', message: 'a string' });
});

test('a Discord error from another copy of the library is still a Discord error', () => {
  const foreign = Object.assign(new Error('Unknown Channel'), {
    name: 'DiscordAPIError[10003]',
    code: 10003,
    status: 404,
    method: 'GET',
    url: `${API}/channels/123456789012345678`,
  });
  expect(classify(foreign)).toMatchObject({ kind: 'discord', code: '10003', status: 404, route: 'GET /channels/:id' });
});

test("discord.js's own errors are internal", () => {
  const own = Object.assign(new Error('The channel is not cached.'), {
    name: 'Error [ChannelNotCached]',
    code: 'ChannelNotCached',
  });
  expect(classify(own)).toMatchObject({ kind: 'internal', code: 'ChannelNotCached' });
});
