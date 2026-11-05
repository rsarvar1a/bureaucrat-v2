import { expect, test } from 'bun:test';
import { withLock } from '../../utilities/lock';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

test('holders of one key run one at a time, in order', async () => {
  const log: string[] = [];
  const job = (name: string) =>
    withLock('k', async () => {
      log.push(`${name} in`);
      await tick();
      log.push(`${name} out`);
      return name;
    });
  expect(await Promise.all([job('a'), job('b'), job('c')])).toEqual(['a', 'b', 'c']);
  expect(log).toEqual(['a in', 'a out', 'b in', 'b out', 'c in', 'c out']);
});

test('different keys do not wait for each other', async () => {
  const log: string[] = [];
  const job = (key: string) =>
    withLock(key, async () => {
      log.push(`${key} in`);
      await tick();
      log.push(`${key} out`);
    });
  await Promise.all([job('x'), job('y')]);
  expect(log.slice(0, 2)).toEqual(['x in', 'y in']);
});

test('a holder that throws releases the key', async () => {
  await expect(withLock('t', async () => Promise.reject(new Error('no')))).rejects.toThrow('no');
  expect(await withLock('t', async () => 'next')).toBe('next');
});
