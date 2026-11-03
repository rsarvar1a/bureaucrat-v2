import { test, expect } from 'bun:test';
import { acceptable } from '../../../engine/discord/uploads';

test('a type matches by prefix, so a charset suffix does not refuse it', () => {
  expect(
    acceptable({ name: 'tb.json', contentType: 'application/json; charset=utf-8' }, { types: ['application/json'] }),
  ).toBe(true);
  expect(acceptable({ name: 'tb.pdf', contentType: 'application/pdf' }, { types: ['application/json'] })).toBe(false);
});

test('an extension rescues a file Discord typed loosely', () => {
  expect(
    acceptable(
      { name: 'tb.json', contentType: 'application/octet-stream' },
      { types: ['application/json'], extensions: ['.json'] },
    ),
  ).toBe(true);
  expect(
    acceptable({ name: 'tb.txt', contentType: null }, { types: ['application/json'], extensions: ['.json'] }),
  ).toBe(false);
});

test('no limits means anything goes', () => {
  expect(acceptable({ name: 'x', contentType: null }, {})).toBe(true);
});
