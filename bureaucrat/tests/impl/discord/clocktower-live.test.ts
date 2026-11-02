import { test, expect } from 'bun:test';
import {
  liveEdition,
  liveGameState,
  liveRoleId,
  liveSeatMemory,
  liveSeatPatch,
  matchLiveSeats,
  officialEdition,
  parseLiveGameState,
  rememberedMatch,
  tokenOf,
  type LiveSeat,
} from '../../../impl/discord/games/clocktower-live';
import type { SquareRow } from '../../../impl/discord/games/published';
import { OFFICIAL, type Character } from '../../../impl/discord/games/script/characters';
import { parseScript } from '../../../impl/discord/games/script/parse';

const row = (seat: number, over: Partial<SquareRow['seat']> = {}, member: bigint | null = BigInt(seat)): SquareRow => ({
  member,
  seat: {
    seat,
    nickname: null,
    state: 'alive',
    traveler: false,
    trueRole: null,
    trueAlignment: null,
    apparentRole: null,
    apparentAlignment: null,
    ...over,
  },
});

const named = (r: SquareRow) => r.seat.nickname ?? `seat ${r.seat.seat}`;

const scriptOf = (edition: string, withTravelers = true): string[] =>
  Object.entries(OFFICIAL)
    .filter(([, role]) => role.edition === edition && (withTravelers || role.team !== 'traveler'))
    .map(([id]) => id);

const charactersOf = (script: unknown): Character[] => {
  const parsed = parseScript(script);
  return parsed.ok ? parsed.script.characters : [];
};

test('a script whose in-play characters are exactly an edition is that edition, travelers aside', () => {
  const tb = [{ id: '_meta', name: 'Trouble Brewing' }, ...scriptOf('tb')];
  expect(officialEdition(charactersOf(tb))).toBe('tb');
  expect(officialEdition(charactersOf(scriptOf('tb', false)))).toBe('tb');
  expect(officialEdition(charactersOf(scriptOf('snv')))).toBe('snv');
  expect(liveEdition(tb, charactersOf(tb))).toEqual({ edition: { id: 'tb' }, roles: '' });
});

test('one character off an edition makes it a custom script', () => {
  const nearly = scriptOf('bmr').filter((id) => id !== 'chambermaid');
  expect(officialEdition(charactersOf(nearly))).toBeNull();
});

test('a custom script becomes a custom edition with the script as its roles, bare ids made objects and _meta kept', () => {
  const script = [{ id: '_meta', name: 'My Script', author: 'me' }, 'chef', 'Fortune_Teller', { id: 'imp' }];
  expect(liveEdition(script, charactersOf(script))).toEqual({
    edition: { id: 'custom', name: 'My Script', author: 'me' },
    roles: [{ id: '_meta', name: 'My Script', author: 'me' }, { id: 'chef' }, { id: 'fortuneteller' }, { id: 'imp' }],
  });
});

test('no script is a bare custom edition', () => {
  expect(liveEdition(null, null)).toEqual({ edition: { id: 'custom' }, roles: [] });
});

test('a role id comes from the script by id or name, else from the official list', () => {
  const chars: Character[] = [{ id: 'mycustom', name: 'My Custom', team: 'townsfolk' }];
  expect(liveRoleId('My Custom', chars)).toBe('mycustom');
  expect(liveRoleId('Beggar', chars)).toBe('beggar');
  expect(liveRoleId('Nobody', chars)).toBeNull();
});

test('players carry their life state and, for travelers only, a role', () => {
  const rows = [
    row(1, { trueRole: 'Imp', state: 'alive' }),
    row(2, { trueRole: 'Chef', state: 'dead', nickname: 'Ann' }),
    row(3, { trueRole: 'Beggar', traveler: true, trueAlignment: 'evil', state: 'spent' }),
    row(4, {}, null),
  ];
  const state = liveGameState(rows, named, null, null);

  expect(state.players.map((p) => p.name)).toEqual(['seat 1', 'Ann', 'seat 3', 'seat 4']);
  expect(state.players.map((p) => p.role)).toEqual([{}, {}, { id: 'beggar' }, {}]);
  expect(state.players.map((p) => p.alignmentIndex)).toEqual([0, 0, 1, 0]);
  expect(state.players.map((p) => p.isDead)).toEqual([false, true, true, false]);
  expect(state.players.map((p) => p.isVoteless)).toEqual([false, false, true, false]);
  expect(state.bluffs).toEqual([null, null, null]);
  expect(state.npcs).toEqual([]);
});

const seat = (over: Partial<LiveSeat> = {}): LiveSeat => ({
  name: 'Ann',
  role: null,
  dead: false,
  voteless: false,
  token: null,
  ...over,
});

test('an uploaded game state is read for its seats: name, role, life and any alignment token', () => {
  const parsed = parseLiveGameState({
    bluffs: [null, null, null],
    edition: { id: 'tb' },
    players: [
      { name: 'Ann', role: { id: 'imp' }, isDead: false, isVoteless: false, alignmentIndex: 1, reminders: [] },
      {
        name: 'Bob',
        role: 'Fortune_Teller',
        isDead: true,
        isVoteless: true,
        alignmentIndex: 0,
        reminders: [{ role: 'evil', name: 'Evil' }],
      },
      { name: '', role: {}, isDead: true, reminders: [{ role: 'custom', name: 'good' }] },
    ],
  });
  expect(parsed).toEqual({
    ok: true,
    seats: [
      { name: 'Ann', role: 'imp', dead: false, voteless: false, token: null },
      { name: 'Bob', role: 'fortuneteller', dead: true, voteless: true, token: 'evil' },
      { name: 'Seat 3', role: null, dead: true, voteless: false, token: 'good' },
    ],
  });
});

test('a good and an evil token together say nothing; other reminders are ignored', () => {
  expect(tokenOf([{ role: 'good' }, { role: 'evil' }])).toBeNull();
  expect(tokenOf([{ role: 'washerwoman', name: 'Townsfolk' }])).toBeNull();
  expect(tokenOf([{ name: ' Good ' }])).toBe('good');
  expect(tokenOf('nope')).toBeNull();
});

test('anything without a players array, or with an empty one, is refused', () => {
  expect(parseLiveGameState(['chef', 'imp']).ok).toBe(false);
  expect(parseLiveGameState({ players: [] }).ok).toBe(false);
  expect(parseLiveGameState({ players: ['Ann'] }).ok).toBe(false);
  expect(parseLiveGameState(null).ok).toBe(false);
});

test("a live seat becomes a life state and a role name; the alignment is the role's own unless a token flips it", () => {
  const chars: Character[] = [{ id: 'mycustom', name: 'My Custom', team: 'minion' }];
  expect(liveSeatPatch(seat(), chars)).toEqual({ state: 'alive' });
  expect(liveSeatPatch(seat({ dead: true }), chars)).toEqual({ state: 'dead' });
  expect(liveSeatPatch(seat({ dead: true, voteless: true }), chars)).toEqual({ state: 'spent' });
  expect(liveSeatPatch(seat({ role: 'imp' }), chars)).toEqual({
    state: 'alive',
    trueRole: 'Imp',
    trueAlignment: null,
    traveler: false,
  });
  expect(liveSeatPatch(seat({ role: 'imp', token: 'evil' }), chars)).toEqual({
    state: 'alive',
    trueRole: 'Imp',
    trueAlignment: null,
    traveler: false,
  });
  expect(liveSeatPatch(seat({ role: 'chef', token: 'evil' }), chars)).toEqual({
    state: 'alive',
    trueRole: 'Chef',
    trueAlignment: 'evil',
    traveler: false,
  });
  expect(liveSeatPatch(seat({ role: 'mycustom', token: 'good' }), chars)).toEqual({
    state: 'alive',
    trueRole: 'My Custom',
    trueAlignment: 'good',
    traveler: false,
  });
  expect(liveSeatPatch(seat({ role: 'beggar' }), null)).toEqual({
    state: 'alive',
    trueRole: 'Beggar',
    trueAlignment: null,
    traveler: true,
  });
  expect(liveSeatPatch(seat({ role: 'beggar', token: 'good' }), null)).toEqual({
    state: 'alive',
    trueRole: 'Beggar',
    trueAlignment: 'good',
    traveler: true,
  });
  expect(liveSeatPatch(seat({ role: 'nobodyknows' }), null)).toEqual({
    state: 'alive',
    trueRole: 'nobodyknows',
    trueAlignment: null,
    traveler: false,
  });
});

const players = [
  { id: 'p1', names: ['Ann', 'annie'] },
  { id: 'p2', names: ['Bob'] },
  { id: 'p3', names: ['Cat'] },
];

test('seats are matched to players by name, each player once, the rest left to the Storyteller', () => {
  expect(matchLiveSeats([seat({ name: 'bob' }), seat({ name: 'Annie' }), seat({ name: 'Ann' })], players)).toEqual({
    '0': 'p2',
    '1': 'p1',
    '2': null,
  });
});

test('the last matching fills a seat of the same name first, a deliberate blank included', () => {
  const remembered = { Ann: 'p3', Bob: null, Dan: 'gone' };
  expect(
    matchLiveSeats(
      [seat({ name: 'Ann' }), seat({ name: 'Bob' }), seat({ name: 'Dan' }), seat({ name: 'Cat' })],
      players,
      remembered,
    ),
  ).toEqual({ '0': 'p3', '1': null, '2': null, '3': null });
});

test('the same seat names as last time, in any order, apply the last matching without asking', () => {
  const known = new Set(['p1', 'p2']);
  const remembered = { Ann: 'p1', Bob: 'p2', Empty: null };
  const same = [seat({ name: 'Ann' }), seat({ name: 'Bob' }), seat({ name: 'Empty' })];
  const swapped = [seat({ name: 'Empty' }), seat({ name: 'Bob' }), seat({ name: 'Ann' })];
  expect(rememberedMatch(same, remembered, known)).toEqual({ '0': 'p1', '1': 'p2', '2': null });
  expect(rememberedMatch(swapped, remembered, known)).toEqual({ '0': null, '1': 'p2', '2': 'p1' });
});

test('a seat renamed, added, dropped, doubled, or whose player left the game brings the matching back', () => {
  const known = new Set(['p1', 'p2']);
  const remembered = { Ann: 'p1', Bob: 'p2' };
  expect(rememberedMatch([seat({ name: 'Ann' }), seat({ name: 'Rob' })], remembered, known)).toBeNull();
  expect(
    rememberedMatch([seat({ name: 'Ann' }), seat({ name: 'Bob' }), seat({ name: 'Cat' })], remembered, known),
  ).toBeNull();
  expect(rememberedMatch([seat({ name: 'Ann' })], remembered, known)).toBeNull();
  expect(rememberedMatch([seat({ name: 'Ann' }), seat({ name: 'Ann' })], { Ann: 'p1', Bob: 'p2' }, known)).toBeNull();
  expect(rememberedMatch([seat({ name: 'Ann' }), seat({ name: 'Bob' })], remembered, new Set(['p1']))).toBeNull();
  expect(rememberedMatch([seat({ name: 'Ann' })], null, known)).toBeNull();
});

test('what is remembered is each seat name and who was put in it', () => {
  expect(liveSeatMemory([seat({ name: 'Ann' }), seat({ name: 'Bob' })], { '0': 'p1' })).toEqual({
    Ann: 'p1',
    Bob: null,
  });
});
