import { test, expect } from 'bun:test';
import { PermissionFlagsBits as F } from 'discord.js';
import { memberOverwrite } from '../../../../impl/discord/games/member-overwrite-rule';

test('no reason, no overwrite', () => {
  expect(memberOverwrite(false, false)).toBeNull();
});

test('a whisper silences town and leaves the threads open', () => {
  expect(memberOverwrite(true, false)).toEqual({ allow: F.SendMessagesInThreads, deny: F.SendMessages });
});

test('a playing Moderator loses Manage Threads and Pin Messages, and keeps their voice', () => {
  expect(memberOverwrite(false, true)).toEqual({ allow: 0n, deny: F.ManageThreads | F.PinMessages });
});

test('both at once, neither undoing the other', () => {
  expect(memberOverwrite(true, true)).toEqual({
    allow: F.SendMessagesInThreads,
    deny: F.SendMessages | F.ManageThreads | F.PinMessages,
  });
});
