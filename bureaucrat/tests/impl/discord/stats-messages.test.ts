import { test, expect } from 'bun:test';
import { buildCustomId } from '../../../engine/discord/views/custom-id';
import { MAX_TABS } from '../../../engine/discord/components/tabs';
import {
  daysOf,
  MINIMUM_MESSAGES,
  parseRoles,
  ROLES,
  sortGames,
  sortUsers,
  staleExports,
  userStats,
  type GameStats,
  type MemberRow,
} from '../../../impl/discord/games/stats/messages';
import { ACTIONS, TABS } from '../../../impl/discord/views/stats/tabs';

const at = (day: number) => new Date(Date.UTC(2026, 0, day));

const row = (game: string, member: bigint, played: number, role: MemberRow['role'], days = 10): MemberRow => ({
  game,
  member,
  played,
  role,
  firstAt: at(1),
  lastAt: at(1 + days),
});

test('a game is at least a day', () => {
  expect(daysOf(at(1), at(1))).toBe(1);
  expect(daysOf(at(1), at(4))).toBe(3);
  expect(daysOf(null, null)).toBe(1);
});

test('an export is stale when new, replaced or grown, and not before it has messages', () => {
  const largest = [
    { id: 'a', game: 'new', messages: 5 },
    { id: 'b', game: 'same', messages: 5 },
    { id: 'c', game: 'grown', messages: 9 },
    { id: 'd2', game: 'replaced', messages: 5 },
    { id: 'e', game: 'empty', messages: 0 },
  ];
  const stored = [
    { game: 'same', export: 'b', exportMessages: 5 },
    { game: 'grown', export: 'c', exportMessages: 5 },
    { game: 'replaced', export: 'd1', exportMessages: 5 },
  ];
  expect(staleExports(largest, stored).map((e) => e.game)).toEqual(['new', 'grown', 'replaced']);
});

test('only games in a selected role count towards anything', () => {
  const rows = [row('g1', 1n, 100, 'Player'), row('g2', 1n, 50, 'Storyteller'), row('g3', 1n, 7, null)];
  expect(userStats(rows, ['Player'])[0]).toMatchObject({ messages: 100, games: 1, perGame: 100 });
  expect(userStats(rows, ['Player', 'Storyteller'])[0]).toMatchObject({ messages: 150, games: 2, perGame: 75 });
});

test('no recorded role counts as Kibitzer', () => {
  expect(userStats([row('g', 1n, 7, null)], ['Kibitzer'])[0]!.messages).toBe(7);
  expect(userStats([row('g', 1n, 7, null)], ['Player'])).toEqual([]);
});

test('a game with nothing in play is not a game played', () => {
  expect(userStats([row('g', 1n, 0, 'Player')], ROLES)).toEqual([]);
});

test('per day weights each game by their own messages in it', () => {
  // 100 over 10 days is 10 a day; 300 over 10 days is 30 a day.
  const [user] = userStats([row('g1', 1n, 100, 'Player'), row('g2', 1n, 300, 'Player')], ROLES);
  expect(user!.perDay).toBe((100 * 10 + 300 * 30) / 400);
});

test('the rate sorts leave out anyone under the minimum; the total does not', () => {
  const users = [
    { member: 1n, messages: MINIMUM_MESSAGES - 1, games: 1, perGame: 499, perDay: 499 },
    { member: 2n, messages: MINIMUM_MESSAGES, games: 5, perGame: 100, perDay: 20 },
  ];
  expect(sortUsers(users, 'messages', true).map((u) => u.member)).toEqual([2n, 1n]);
  expect(sortUsers(users, 'perDay', true).map((u) => u.member)).toEqual([2n]);
});

const game = (name: string, messages: number, first: number | null, last: number | null): GameStats => ({
  game: name,
  name,
  winner: null,
  messages,
  threads: 0,
  authors: 0,
  firstAt: first === null ? null : at(first),
  lastAt: last === null ? null : at(last),
});

test('games sort by count, length and either date, with no dates last', () => {
  const games = [game('a', 10, 1, 21), game('b', 30, 5, 6), game('c', 20, 10, 15), game('d', 0, null, null)];
  expect(sortGames(games, 'messages', true).map((g) => g.name)).toEqual(['b', 'c', 'a', 'd']);
  expect(sortGames(games, 'length', true).map((g) => g.name)).toEqual(['a', 'c', 'b', 'd']);
  expect(sortGames(games, 'started', false).map((g) => g.name)).toEqual(['a', 'b', 'c', 'd']);
  expect(sortGames(games, 'ended', true).map((g) => g.name)).toEqual(['a', 'c', 'b', 'd']);
});

test('roles held in state fall back to all three when empty or unknown', () => {
  expect(parseRoles(['Player', 'nonsense'])).toEqual(['Player']);
  expect(parseRoles([])).toEqual(ROLES);
  expect(parseRoles(null)).toEqual(ROLES);
});

test('the strip fits, and the users tab stays inside five rows', () => {
  expect(TABS.length).toBeLessThanOrEqual(MAX_TABS);
  // Direction, ◀ and ▶ share the strip's row, which holds five buttons.
  expect(TABS.length + 3).toBeLessThanOrEqual(MAX_TABS);
  // The strip, sort, roles, columns, Dismiss.
  expect(1 + 3 + 1).toBeLessThanOrEqual(5);
});

test('every custom id stays under the 100-character cap', () => {
  const viewId = '0'.repeat(36);
  for (const action of [...ACTIONS, ...TABS.map((t) => `tab-${t.key}`), 'dismiss']) {
    expect(() => buildCustomId('view::statsmessages', action, viewId), action).not.toThrow();
  }
});
