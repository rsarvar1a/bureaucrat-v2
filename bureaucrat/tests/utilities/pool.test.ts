import { expect, test } from 'bun:test';
import { offsiteReaders, offsiteWriters, poolSize } from '../../utilities/pool';

test('writers: OFFSITE_WRITERS, else the older OFFSITE_CONCURRENCY, else four', () => {
  expect(offsiteWriters({})).toBe(4);
  expect(offsiteWriters({ OFFSITE_CONCURRENCY: '32' })).toBe(32);
  expect(offsiteWriters({ OFFSITE_CONCURRENCY: '32', OFFSITE_WRITERS: '16' })).toBe(16);
  expect(offsiteWriters({ OFFSITE_WRITERS: '0' })).toBe(4);
  expect(offsiteWriters({ OFFSITE_WRITERS: 'many' })).toBe(4);
  expect(offsiteWriters({ OFFSITE_WRITERS: '12.7' })).toBe(12);
});

test('readers: OFFSITE_READERS, else four, whatever the writers', () => {
  expect(offsiteReaders({})).toBe(4);
  expect(offsiteReaders({ OFFSITE_CONCURRENCY: '64' })).toBe(4);
  expect(offsiteReaders({ OFFSITE_READERS: '6' })).toBe(6);
  expect(offsiteReaders({ OFFSITE_READERS: '' })).toBe(4);
});

test('the pool follows both pools unless set, under Postgres default ceiling', () => {
  expect(poolSize({})).toBe(26);
  expect(poolSize({ OFFSITE_CONCURRENCY: '24' })).toBe(66);
  expect(poolSize({ OFFSITE_WRITERS: '60' })).toBe(80);
  expect(poolSize({ OFFSITE_WRITERS: '12', DATABASE_POOL_SIZE: '5' })).toBe(5);
  expect(poolSize({ DATABASE_POOL_SIZE: '150' })).toBe(150);
});
