import { test, expect } from 'bun:test';
import { emoteFinder, HOME_GUILD, type EmoteSource } from '../../../impl/discord/games/emotes';

const guild = (
  id: string,
  emojis: [string, string, boolean?][],
): [string, EmoteSource['guilds']['cache'] extends Map<string, infer G> ? G : never] => [
  id,
  {
    id,
    emojis: {
      cache: new Map(emojis.map(([eid, name, animated]) => [eid, { id: eid, name, animated: animated ?? false }])),
    },
  },
];

const client: EmoteSource = {
  guilds: {
    cache: new Map([
      guild('other', [
        ['1', 'fortuneteller'],
        ['2', 'Imp'],
      ]),
      guild(HOME_GUILD, [
        ['3', 'FortuneTeller'],
        ['4', 'chef', true],
      ]),
      guild('game', [['5', 'fortune_teller']]),
    ]),
  },
};

test('matches by normalised name, game server first, then the Office, then the rest', () => {
  const emote = emoteFinder(client, 'game');
  expect(emote('Fortune Teller')?.id).toBe('5');
  expect(emote('Chef')).toMatchObject({ id: '4', animated: true, mention: '<a:chef:4>' });
  expect(emote('Imp')?.mention).toBe('<:Imp:2>');
});

test('a game server the bot is not in falls through to the Office', () => {
  expect(emoteFinder(client, 'elsewhere')('fortune teller')?.id).toBe('3');
});

test("the application's own emoji come after the Office and before other servers", () => {
  const withApp: EmoteSource = {
    ...client,
    application: {
      emojis: {
        cache: new Map([
          ['9', { id: '9', name: 'Imp', animated: false }],
          ['10', { id: '10', name: 'chef', animated: false }],
          ['11', { id: '11', name: 'washerwoman', animated: false }],
        ]),
      },
    },
  };
  const emote = emoteFinder(withApp, 'game');
  expect(emote('Imp')?.id).toBe('9');
  expect(emote('Chef')?.id).toBe('4');
  expect(emote('Washerwoman')?.id).toBe('11');
  expect(emoteFinder(withApp, 'elsewhere')('Imp')?.id).toBe('9');
});

test('no emote, no match', () => {
  const emote = emoteFinder(client, 'game');
  expect(emote('Washerwoman')).toBeNull();
  expect(emote(null)).toBeNull();
});

test('several candidates: the earliest source wins, then the earlier name', () => {
  const withApp: EmoteSource = {
    ...client,
    application: {
      emojis: {
        cache: new Map([
          ['20', { id: '20', name: 'imp_e', animated: false }],
          ['21', { id: '21', name: 'barista_e', animated: false }],
          ['22', { id: '22', name: 'barista', animated: false }],
          ['23', { id: '23', name: 'chef_e', animated: false }],
        ]),
      },
    },
  };
  const emote = emoteFinder(withApp, 'game');
  // The aligned icon is preferred within one source...
  expect(emote(['barista_e', 'barista'])?.id).toBe('21');
  // ...and across sources the nearer one wins whichever name it holds.
  expect(emote(['imp_e', 'imp'])?.id).toBe('20');
  expect(emote(['chef_e', 'chef'])?.id).toBe('4');
  expect(emote(['nobody_g', 'nobody'])).toBeNull();
  expect(emote([])).toBeNull();
});
