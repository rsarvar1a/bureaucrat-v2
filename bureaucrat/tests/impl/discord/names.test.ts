import { test, expect } from 'bun:test';
import {
  parseDateStamp,
  titleFromChannelName,
  channelName,
  dateStamp,
  endedChannelName,
  reactionsThreadName,
  revealThreadName,
  stThreadName,
  THREAD_NAMES,
} from '../../../impl/discord/games/names';

test('a title becomes a channel name Discord will accept', () => {
  expect(channelName('Trouble Brewing')).toBe('trouble-brewing');
  expect(channelName("  Sects & Violets: Rohan's game!! ")).toBe('sects-violets-rohan-s-game');
});

test('a title of nothing but punctuation still names a channel', () => {
  expect(channelName('???')).toBe('game');
});

test('a long title is cut at the limit without a trailing dash', () => {
  const name = channelName(`${'a'.repeat(99)} ${'b'.repeat(20)}`);
  expect(name.length).toBeLessThanOrEqual(100);
  expect(name.endsWith('-')).toBe(false);
});

test('an ended game is filed under the date it ended', () => {
  const ended = new Date(Date.UTC(2026, 10, 1, 23, 59));
  expect(dateStamp(ended)).toBe('20261101');
  expect(endedChannelName('Trouble Brewing', ended)).toBe('20261101-trouble-brewing');
});

test('a long title gives way to the date stamp at the limit', () => {
  const name = endedChannelName('a'.repeat(120), new Date(Date.UTC(2026, 0, 9)));
  expect(name.startsWith('20260109-')).toBe(true);
  expect(name.length).toBeLessThanOrEqual(100);
  expect(name.endsWith('-')).toBe(false);
});

test('the three core threads have distinct names', () => {
  const names = Object.values(THREAD_NAMES);
  expect(new Set(names).size).toBe(names.length);
});

test('the reveal and its reactions thread are named from the write-up', () => {
  expect(revealThreadName('The Fall of Ravenswood')).toBe('Reveal: The Fall of Ravenswood');
  expect(revealThreadName('a'.repeat(120)).length).toBe(100);
  expect(reactionsThreadName()).toBe('Reveal Reactions');
});

test("a player's thread is named from what they are called", () => {
  expect(stThreadName('Rohan S.')).toBe('ST Thread - Rohan S.');
  expect(stThreadName('   ')).toBe('ST Thread - player');
  expect(stThreadName('a'.repeat(120)).length).toBe(100);
});

test('a stamped channel name gives back its date and its title', () => {
  expect(parseDateStamp('20261101-my-game')).toEqual(new Date(Date.UTC(2026, 10, 1)));
  expect(parseDateStamp('20261101')).toEqual(new Date(Date.UTC(2026, 10, 1)));
  expect(parseDateStamp('my-game')).toBeNull();
  expect(parseDateStamp('2026110-x')).toBeNull();
  expect(titleFromChannelName('20261101-my-game')).toBe('my game');
  expect(titleFromChannelName('trouble-brewing')).toBe('trouble brewing');
  expect(titleFromChannelName('20261101')).toBe('game');
});
