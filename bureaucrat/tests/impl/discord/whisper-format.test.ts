import { test, expect } from 'bun:test';
import { memberLines, standingText } from '../../../impl/discord/views/whispers/format';

const standing = { participant: 'a', spent: { total: 1, async: 0 }, allowance: { total: 2, async: 1 } };
const left = new Date(1_700_000_000_000);

test('a standing reads x / y, with the async pair only when the game has any', () => {
  expect(standingText(standing)).toBe('1 / 2 (0 / 1 async)');
  expect(standingText({ ...standing, allowance: { total: 2, async: 0 } })).toBe('1 / 2');
  expect(standingText(undefined)).toBeNull();
});

test('a member still in reads their name and standing', () => {
  expect(memberLines('<@1>', standing, null, { closed: false, precise: false })).toBe('<@1>\n- 1 / 2 (0 / 1 async)');
  expect(memberLines('<@1>', undefined, null, { closed: false, precise: true })).toBe('<@1>');
});

test('without precise tracking a leave is noted while the whisper is open and dropped once it has closed', () => {
  expect(memberLines('<@1>', standing, left, { closed: false, precise: false })).toBe(
    '<@1>\n- 1 / 2 (0 / 1 async) · ended',
  );
  expect(memberLines('<@1>', standing, left, { closed: true, precise: false })).toBe('<@1>\n- 1 / 2 (0 / 1 async)');
});

test('with precise tracking a leave carries its time, open or closed', () => {
  const stamp = `<t:${Math.floor(left.getTime() / 1000)}:R>`;
  expect(memberLines('<@1>', standing, left, { closed: false, precise: true })).toBe(
    `<@1>\n- 1 / 2 (0 / 1 async) · ended ${stamp}`,
  );
  expect(memberLines('<@1>', undefined, left, { closed: true, precise: true })).toBe(`<@1>\n- ended ${stamp}`);
});
