import { test, expect } from 'bun:test';
import { CARD_BUDGET, LADDER, fitPreviews, preview } from '../../../impl/discord/views/queue/preview';

test('a short description is quoted whole', () => {
  expect(preview('A quick game.', 100)).toBe('> A quick game.');
});

test('a long one is cut at the cap with a marker', () => {
  const long = 'x'.repeat(150);
  expect(preview(long, 100)).toBe(`> ${'x'.repeat(100)}...`);
  expect(preview('x'.repeat(100), 100)).toBe(`> ${'x'.repeat(100)}`);
});

test('line breaks flow into the quote, a paragraph gap is an empty quoted line, and nothing is quoted for nothing', () => {
  expect(preview('First line.\n\n\nSecond   line. \n Third.', 100)).toBe('> First line.\n> \n> Second line.\n> Third.');
  expect(preview('abcdef\nghijkl', 8)).toBe('> abcdef\n> g...');
  expect(preview('  \n ', 100)).toBeNull();
  expect(preview('Some text.', 0)).toBeNull();
});

test('the ladder descends and the budget leaves room for the fixed lines', () => {
  for (let i = 1; i < LADDER.length; i += 1) expect(LADDER[i]!).toBeLessThan(LADDER[i - 1]!);
  expect(CARD_BUDGET).toBeLessThanOrEqual(4000);
});

test('the fit is the longest rung that holds, and zero when none does', () => {
  // Ten entries of 150 fixed characters plus the preview each.
  const measure = (length: number) => 10 * (150 + Math.min(length, 300));
  expect(fitPreviews(measure, 4000)).toBe(240);
  expect(fitPreviews(measure, 3000)).toBe(150);
  expect(fitPreviews(measure, 1600)).toBe(0);
  expect(fitPreviews(() => 100)).toBe(LADDER[0]);
});
