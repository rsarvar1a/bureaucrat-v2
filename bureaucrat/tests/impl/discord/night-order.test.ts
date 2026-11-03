import { test, expect } from 'bun:test';
import { cleanReminder, nightOrder, parseNights, SCOPES } from '../../../impl/discord/games/script/night';
import { parseScript } from '../../../impl/discord/games/script/parse';

const script = (raw: unknown) => {
  const parsed = parseScript(raw);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.script;
};

const TB = [
  'washerwoman',
  'chef',
  'empath',
  'fortuneteller',
  'undertaker',
  'monk',
  'ravenkeeper',
  'butler',
  'poisoner',
  'spy',
  'scarletwoman',
  'imp',
];

test('a fully official script follows the night sheet, markers included', () => {
  const first = nightOrder(script(TB), null, 'first');
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const ids = first.entries.map((e) => e.id);
  expect(ids[0]).toBe('dusk');
  expect(ids.at(-1)).toBe('dawn');
  expect(ids).toContain('minioninfo');
  expect(ids).toContain('demoninfo');
  expect(ids.indexOf('poisoner')).toBeLessThan(ids.indexOf('washerwoman'));
  expect(ids).not.toContain('imp');
  expect(ids).not.toContain('monk');
  expect(first.entries.find((e) => e.id === 'washerwoman')?.reminder).toContain('Townsfolk');
  // The info steps borrow the team icons.
  expect(first.entries.find((e) => e.id === 'minioninfo')?.emote).toBe('minion');
  expect(first.entries.find((e) => e.id === 'demoninfo')?.emote).toBe('demon');
  expect(first.entries.find((e) => e.id === 'dusk')?.emote).toBeUndefined();

  const other = nightOrder(script(TB), null, 'other');
  expect(other.ok).toBe(true);
  if (!other.ok) return;
  const otherIds = other.entries.map((e) => e.id);
  expect(otherIds).toContain('imp');
  expect(otherIds).not.toContain('washerwoman');
  expect(otherIds).not.toContain('minioninfo');
  expect(otherIds.indexOf('monk')).toBeLessThan(otherIds.indexOf('imp'));
});

test('in play keeps seated true roles, apparent adds what players believe, markers always', () => {
  const inPlay = { trueRoles: ['Imp', 'Fortune Teller', 'Poisoner'], apparentRoles: ['Fortune Teller', 'Monk'] };
  const all = nightOrder(script(TB), null, 'other', 'all', inPlay);
  expect(SCOPES).toEqual(['apparent', 'all', 'inplay']);
  const playing = nightOrder(script(TB), null, 'other', 'inplay', inPlay);
  const apparent = nightOrder(script(TB), null, 'other', 'apparent', inPlay);
  if (!all.ok || !playing.ok || !apparent.ok) throw new Error('expected orders');
  const ids = (order: typeof all) => order.entries.map((e) => e.id);
  expect(ids(all)).toContain('monk');
  expect(ids(all)).toContain('empath');
  expect(ids(playing)).toEqual(['dusk', 'poisoner', 'imp', 'fortuneteller', 'dawn']);
  expect(ids(apparent)).toEqual(['dusk', 'poisoner', 'monk', 'imp', 'fortuneteller', 'dawn']);
  // An explicit list is filtered the same way.
  const nights = parseNights({ otherNight: ['dusk', 'empath', 'imp', 'dawn'] });
  if (!nights.ok) throw new Error('expected nights');
  expect(nightOrder(script(TB), nights.nights, 'other', 'inplay', inPlay)).toMatchObject({
    entries: [{ id: 'dusk' }, { id: 'imp' }, { id: 'dawn' }],
  });
});

test('an explicit list wins over the sheet, and _meta over derivation', () => {
  const nights = parseNights({ firstNight: ['dusk', 'imp', 'washerwoman', 'dawn'] });
  expect(nights.ok).toBe(true);
  if (!nights.ok) return;
  const order = nightOrder(script(TB), nights.nights, 'first');
  expect(order.ok && order.entries.map((e) => e.id)).toEqual(['dusk', 'imp', 'washerwoman', 'dawn']);

  const withMeta = script([{ id: '_meta', name: 'X', otherNight: ['dusk', 'empath', 'imp'] }, ...TB]);
  const other = nightOrder(withMeta, null, 'other');
  expect(other.ok && other.entries.map((e) => e.id)).toEqual(['dusk', 'empath', 'imp']);
  // Only otherNight was given: the first night still derives.
  const first = nightOrder(withMeta, null, 'first');
  expect(first.ok && first.entries[0]?.id).toBe('dusk');
});

test('fully specced homebrew sorts by priority between the markers', () => {
  const homebrew = script([
    { id: 'late', name: 'Late', team: 'townsfolk', ability: 'x', firstNight: 30, firstNightReminder: 'Late acts.' },
    {
      id: 'early',
      name: 'Early',
      team: 'minion',
      ability: 'x',
      firstNight: 5,
      firstNightReminder: 'Early acts. :reminder:',
    },
    { id: 'sleeper', name: 'Sleeper', team: 'outsider', ability: 'x', firstNight: 0, otherNight: 0 },
  ]);
  const order = nightOrder(homebrew, null, 'first');
  expect(order.ok && order.entries.map((e) => e.id)).toEqual([
    'dusk',
    'minioninfo',
    'demoninfo',
    'early',
    'late',
    'dawn',
  ]);
  expect(order.ok && order.entries.find((e) => e.id === 'early')?.reminder).toBe('Early acts.');
});

test('mixed and unspecced scripts are refused with the reason', () => {
  const mixed = script(['imp', { id: 'late', name: 'Late', team: 'townsfolk', ability: 'x', otherNight: 30 }]);
  expect(nightOrder(mixed, null, 'other')).toEqual({ ok: false, reason: 'mixed' });

  const unspecced = script([
    'imp',
    { id: 'vague', name: 'Vague', team: 'townsfolk', ability: 'x', otherNightReminder: 'Hmm.' },
  ]);
  expect(nightOrder(unspecced, null, 'other')).toEqual({ ok: false, reason: 'unspecced' });
});

test('night order files are checked for shape and reminders lose their tokens', () => {
  expect(parseNights([1, 2]).ok).toBe(false);
  expect(parseNights({ firstNight: 'dusk' }).ok).toBe(false);
  expect(parseNights({ otherNight: ['Dusk', 'Fortune Teller'] })).toEqual({
    ok: true,
    nights: { firstNight: null, otherNight: ['dusk', 'fortuneteller'] },
  });
  expect(cleanReminder('The Sailor chooses a living player. :reminder:')).toBe('The Sailor chooses a living player.');
});
