import { expect, mock, test } from 'bun:test';

const rows: Record<string, unknown>[] = [];
void mock.module('../../../drizzle/error-events', () => ({
  insertErrorEvent: async (row: Record<string, unknown>) => {
    rows.push(row);
  },
}));
const { abortIfTransient, fault, faultScope, swallow } = await import('../../../impl/discord/errors/record');

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

test('interleaved jobs each file under their own scope', async () => {
  rows.length = 0;
  const job = (id: string) =>
    faultScope({ area: 'offsite', game: `g${id}`, export: `e${id}` }, async () => {
      await tick();
      fault('read.channel', 'degraded', new Error(`job ${id}`), { channel: 42n });
    });
  await Promise.all([job('1'), job('2'), job('3')]);
  expect(rows.map((r) => [r['message'], r['game'], r['export'], r['channel']])).toEqual(
    expect.arrayContaining([
      ['job 1', 'g1', 'e1', 42n],
      ['job 2', 'g2', 'e2', 42n],
      ['job 3', 'g3', 'e3', 42n],
    ]),
  );
  expect(rows.every((r) => r['area'] === 'offsite' && r['outcome'] === 'degraded')).toBe(true);
});

test('swallow records and answers the fallback', async () => {
  rows.length = 0;
  const value = await Promise.reject(new Error('gone')).catch(swallow('write.pin', 'degraded', 'fallback'));
  expect(value).toBe('fallback');
  expect(rows[0]).toMatchObject({ area: 'bot', operation: 'write.pin', kind: 'other', message: 'gone' });
  expect(typeof (rows[0]!['detail'] as { stack?: unknown }).stack).toBe('string');
});

test('outside a scope, extra names the area', () => {
  rows.length = 0;
  fault('tick', 'failed', new Error('x'), { area: 'offsite' });
  expect(rows[0]).toMatchObject({ area: 'offsite', operation: 'tick', game: null, export: null });
});

const dns = () => Object.assign(new Error('getaddrinfo EAI_AGAIN discord.com'), { code: 'EAI_AGAIN' });

test('a transient error stops a fallback that would lose something, recorded as aborted', async () => {
  rows.length = 0;
  const degraded = Promise.reject(dns()).catch(swallow('read.reactions', 'degraded', null));
  await expect(degraded).rejects.toThrow('EAI_AGAIN');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ operation: 'read.reactions', outcome: 'aborted', kind: 'network' });

  rows.length = 0;
  await expect(Promise.reject(dns()).catch(swallow('read.source', 'failed', null))).rejects.toThrow('EAI_AGAIN');
  expect(rows[0]).toMatchObject({ outcome: 'aborted' });
});

test('a fallback that loses nothing takes even a transient error', async () => {
  rows.length = 0;
  expect(await Promise.reject(dns()).catch(swallow('read.members', 'ignored', 'fallback'))).toBe('fallback');
  expect(rows[0]).toMatchObject({ operation: 'read.members', outcome: 'ignored' });
});

test('a real refusal still degrades, as before', async () => {
  rows.length = 0;
  const refused = Object.assign(new Error('Missing Access'), {
    name: 'DiscordAPIError[50001]',
    code: 50001,
    status: 403,
    method: 'GET',
    url: 'https://discord.com/api/v10/channels/1/messages',
  });
  expect(await Promise.reject(refused).catch(swallow('read.channel', 'degraded', null))).toBeNull();
  expect(rows[0]).toMatchObject({ outcome: 'degraded', kind: 'discord', code: '50001' });
});

test('abortIfTransient lets a refusal through to the catch and throws a passing failure on', () => {
  rows.length = 0;
  expect(() => abortIfTransient('read.channel', new Error('Missing Access'))).not.toThrow();
  expect(rows).toHaveLength(0);
  expect(() => abortIfTransient('read.channel', dns())).toThrow('EAI_AGAIN');
  expect(rows[0]).toMatchObject({ outcome: 'aborted' });
});
