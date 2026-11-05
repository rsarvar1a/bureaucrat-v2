import { expect, test } from 'bun:test';
import { offsiteConcurrency, poolSize } from '../../utilities/pool';

test('offsite concurrency defaults to four and ignores nonsense', () => {
  expect(offsiteConcurrency({})).toBe(4);
  expect(offsiteConcurrency({ OFFSITE_CONCURRENCY: '' })).toBe(4);
  expect(offsiteConcurrency({ OFFSITE_CONCURRENCY: '0' })).toBe(4);
  expect(offsiteConcurrency({ OFFSITE_CONCURRENCY: 'many' })).toBe(4);
  expect(offsiteConcurrency({ OFFSITE_CONCURRENCY: '12.7' })).toBe(12);
});

test('the pool follows the concurrency unless set, and stays under Postgres default ceiling', () => {
  expect(poolSize({})).toBe(18);
  expect(poolSize({ OFFSITE_CONCURRENCY: '12' })).toBe(34);
  expect(poolSize({ OFFSITE_CONCURRENCY: '60' })).toBe(80);
  expect(poolSize({ OFFSITE_CONCURRENCY: '12', DATABASE_POOL_SIZE: '5' })).toBe(5);
  expect(poolSize({ DATABASE_POOL_SIZE: '150' })).toBe(150);
  expect(poolSize({ DATABASE_POOL_SIZE: '' })).toBe(18);
});
