import { test, expect } from 'bun:test';
import {
  draftOf,
  isComplete,
  isMark,
  parseMark,
  QUESTIONS,
  stars,
  summarize,
} from '../../../impl/discord/games/rating';

test('the summary averages each mark and counts the ratings', () => {
  const summary = summarize([
    { script: 5, decisions: 3, atmosphere: 4, overall: 4 },
    { script: 3, decisions: 3, atmosphere: 5, overall: 2 },
  ]);
  expect(summary.count).toBe(2);
  expect(summary.average).toEqual({ script: 4, decisions: 3, atmosphere: 4.5, overall: 3 });
  expect(summarize([]).average.script).toBe(0);
});

test('stars round to the nearest whole and fill to five', () => {
  expect(stars(4.5)).toBe('★★★★★');
  expect(stars(2.4)).toBe('★★☆☆☆');
  expect(stars(0)).toBe('☆☆☆☆☆');
});

test('a mark is a whole number from one to five, however it is typed', () => {
  expect(isMark(3)).toBe(true);
  expect(isMark(0)).toBe(false);
  expect(isMark(6)).toBe(false);
  expect(parseMark('4')).toBe(4);
  expect(parseMark(' 5 ')).toBe(5);
  expect(parseMark('3/5')).toBe(3);
  expect(parseMark('6')).toBeNull();
  expect(parseMark('four')).toBeNull();
  expect(parseMark('')).toBeNull();
});

test('a draft is complete once every question has a mark', () => {
  expect(isComplete({})).toBe(false);
  expect(isComplete({ script: 5, decisions: 4, atmosphere: 3 })).toBe(false);
  expect(isComplete({ script: 5, decisions: 4, atmosphere: 3, overall: 5 })).toBe(true);
  expect(draftOf(undefined)).toEqual({});
});

test('every question label fits a modal', () => {
  for (const q of QUESTIONS) {
    expect(q.question.length).toBeLessThanOrEqual(45);
    expect(q.more.length).toBeLessThanOrEqual(45);
    expect(q.hint.length).toBeLessThanOrEqual(100);
  }
});
