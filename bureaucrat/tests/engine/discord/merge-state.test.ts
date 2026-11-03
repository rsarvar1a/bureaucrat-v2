import { test, expect } from 'bun:test';
import { mergeState } from '../../../engine/discord/views/lifecycle';

test('a partial caller state keeps the rest of the defaults', () => {
  // The bug this fixes: `/admin config` passes only `{ guild }`, so the mode
  // that decides which group is on screen arrived undefined and the panel
  // opened on a bare selector with nothing beneath it.
  expect(mergeState({ guild: '', mode: 'teams' }, { guild: '123' })).toEqual({ guild: '123', mode: 'teams' });
});

test('the caller wins on every field it supplies', () => {
  expect(mergeState({ guild: '', mode: 'teams' }, { guild: '123', mode: 'meta' })).toEqual({
    guild: '123',
    mode: 'meta',
  });
});

test('an explicit undefined from the caller still overrides', () => {
  // Spreading keeps the key, so this is a deliberate erasure rather than an
  // omission - worth pinning so it does not change quietly.
  expect(mergeState({ mode: 'teams' }, { mode: undefined })).toEqual({ mode: undefined });
});

test('no caller state leaves the defaults intact', () => {
  expect(mergeState({ mode: 'teams' }, undefined)).toEqual({ mode: 'teams' });
});

test('no defaults leaves the caller state intact', () => {
  expect(mergeState(undefined, { guild: '123' })).toEqual({ guild: '123' });
});

test('non-objects cannot be merged into, so the caller simply wins', () => {
  expect(mergeState({ mode: 'teams' }, 'raw')).toBe('raw');
  expect(mergeState({ mode: 'teams' }, [1, 2])).toEqual([1, 2]);
  expect(mergeState('raw', { mode: 'teams' })).toEqual({ mode: 'teams' });
});

test('null defaults and null caller state do not throw', () => {
  expect(mergeState(null, null)).toBeNull();
  expect(mergeState(null, { a: 1 })).toEqual({ a: 1 });
});
