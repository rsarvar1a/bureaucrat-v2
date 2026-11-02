import { test, expect } from 'bun:test';
import {
  dueOffsets,
  headsUpText,
  isDone,
  quoted,
  reminderHeader,
  remainingHeadsUps,
} from '../../../impl/discord/games/reminders/schedule';
import { roleMentions } from '../../../impl/discord/games/roles';

const at = (seconds: number) => new Date(seconds * 1000);
const schedule = (posted: number[] = []) => ({ fireAt: at(10_000), offsets: [3_600, 1_800], posted });

test('nothing is due before the first heads-up', () => {
  expect(dueOffsets(schedule(), at(10_000 - 3_601))).toEqual([]);
});

test('each post is due once its moment comes, and never again', () => {
  expect(dueOffsets(schedule(), at(10_000 - 3_600))).toEqual([3_600]);
  expect(dueOffsets(schedule([3_600]), at(10_000 - 1_800))).toEqual([1_800]);
  expect(dueOffsets(schedule([3_600, 1_800]), at(10_000))).toEqual([0]);
  expect(dueOffsets(schedule([3_600, 1_800, 0]), at(20_000))).toEqual([]);
});

test('after downtime everything missed is due at once, longest first, so the caller posts the last', () => {
  expect(dueOffsets(schedule(), at(10_000))).toEqual([3_600, 1_800, 0]);
  expect(dueOffsets(schedule(), at(10_000 - 1_000))).toEqual([3_600, 1_800]);
});

test('a reminder is done once the final post is recorded', () => {
  expect(isDone({ posted: [3_600] })).toBe(false);
  expect(isDone({ posted: [3_600, 0] })).toBe(true);
  expect(remainingHeadsUps(schedule([3_600]))).toEqual([1_800]);
});

test('the header names who it is for and when it is due; the message is quoted beneath', () => {
  expect(reminderHeader(at(10_000), ['<@&1>', '<@&2>'])).toBe('Reminder for <@&1>, <@&2> <t:10000:R>');
  expect(reminderHeader(at(10_000), [])).toBe('Reminder <t:10000:R>');
  expect(quoted('Nominations close.\nVote now.')).toBe('> Nominations close.\n> Vote now.');
  expect(headsUpText([1_800, 3_600])).toBe('1h, 30m before');
  expect(headsUpText([])).toBe('none');
});

test('a logical role is mentioned through its tracked role, or named when the game has none', () => {
  expect(roleMentions(['Player', 'Kibitzer'], { Player: 5n })).toEqual({
    text: ['<@&5>', '**Kibitzers**'],
    ids: ['5'],
  });
});
