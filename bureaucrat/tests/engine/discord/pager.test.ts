import { test, expect } from 'bun:test';
import { clampPage, pageCount, pageItems } from '../../../engine/discord/components/pager';

test('an empty list still has one page', () => {
  expect(pageCount(0, 15)).toBe(1);
  expect(pageCount(15, 15)).toBe(1);
  expect(pageCount(16, 15)).toBe(2);
});

test('a held page outside the list comes back inside it', () => {
  expect(clampPage(5, 2)).toBe(1);
  expect(clampPage(-1, 2)).toBe(0);
  expect(clampPage(1, 2)).toBe(1);
});

test('a page is its window of the list', () => {
  expect(pageItems([1, 2, 3, 4, 5], 1, 2)).toEqual([3, 4]);
  expect(pageItems([1, 2, 3, 4, 5], 2, 2)).toEqual([5]);
});
