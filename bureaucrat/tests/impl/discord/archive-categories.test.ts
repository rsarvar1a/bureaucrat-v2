import { expect, test } from 'bun:test';
import { DiscordAPIError } from 'discord.js';
import { isCategoryFull } from '../../../impl/discord/games/archives/categories';

const formError = (code: string) =>
  new DiscordAPIError(
    { code: 50035, message: 'Invalid Form Body', errors: { parent_id: { _errors: [{ code, message: '…' }] } } },
    50035,
    400,
    'POST',
    'https://discord.com/api/v10/guilds/1/channels',
    {},
  );

test('a full category is told apart from other refusals', () => {
  expect(isCategoryFull(formError('CHANNEL_PARENT_MAX_CHANNELS'))).toBe(true);
  expect(isCategoryFull(formError('CHANNEL_PARENT_INVALID'))).toBe(false);
  expect(isCategoryFull(new Error('CHANNEL_PARENT_MAX_CHANNELS'))).toBe(false);
});
