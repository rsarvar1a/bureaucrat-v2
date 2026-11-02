import type { SquareRow } from './published';
import { normalizeId, OFFICIAL, type Character } from './script/characters';

/** The editions clocktower.live ships with; anything else is a custom script. */
const EDITIONS = ['tb', 'bmr', 'snv'] as const;

const CORE_TEAMS = new Set<string>(['townsfolk', 'outsider', 'minion', 'demon']);

/** Each edition's in-play characters (travelers and fabled aside), from the release data. */
const EDITION_CORE: Record<(typeof EDITIONS)[number], Set<string>> = Object.fromEntries(
  EDITIONS.map((edition) => [
    edition,
    new Set(
      Object.entries(OFFICIAL)
        .filter(([, role]) => role.edition === edition && CORE_TEAMS.has(role.team))
        .map(([id]) => id),
    ),
  ]),
) as Record<(typeof EDITIONS)[number], Set<string>>;

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** The official edition a script is, when its in-play characters are exactly one edition's. */
export const officialEdition = (characters: Character[] | null | undefined): (typeof EDITIONS)[number] | null => {
  if (!characters) return null;
  const core = new Set(characters.filter((c) => CORE_TEAMS.has(c.team)).map((c) => c.id));
  return EDITIONS.find((edition) => sameSet(core, EDITION_CORE[edition])) ?? null;
};

export type LivePlayer = {
  name: string;
  id: string;
  connected: boolean;
  role: Record<string, never> | { id: string };
  alignmentIndex: number;
  reminders: never[];
  isVoteless: boolean;
  hasTwoVotes: boolean;
  hasResponded: Record<string, never>;
  isDead: boolean;
  handRaised: boolean;
  pronouns: string;
};

export type LiveGameState = {
  bluffs: [null, null, null];
  edition: { id: string; name?: string; author?: string };
  roles: '' | unknown[];
  npcs: never[];
  players: LivePlayer[];
};

type Meta = { name?: unknown; author?: unknown };

const asString = (raw: unknown): string | undefined => (typeof raw === 'string' && raw.trim() ? raw.trim() : undefined);

const metaOf = (script: unknown[]): Meta | null => {
  const entry = script.find((e) => e && typeof e === 'object' && (e as { id?: unknown }).id === '_meta');
  return (entry as Meta | undefined) ?? null;
};

/**
 * A script entry as the site reads it: the script tool's bare id strings
 * become `{ id }` objects, and the rest (`_meta` included) go through as they are.
 */
export const liveRole = (entry: unknown): unknown => (typeof entry === 'string' ? { id: normalizeId(entry) } : entry);

/**
 * The edition clocktower.live should load: one of its own when the script's
 * characters are exactly that edition's (the script tool's `_meta` never says
 * which edition a script is), otherwise the script itself as a custom edition,
 * and a bare custom edition with no roles when the game has no script.
 */
export const liveEdition = (
  script: unknown,
  characters: Character[] | null | undefined,
): Pick<LiveGameState, 'edition' | 'roles'> => {
  if (!Array.isArray(script)) return { edition: { id: 'custom' }, roles: [] };

  const official = officialEdition(characters);
  if (official) return { edition: { id: official }, roles: '' };

  const meta = metaOf(script);

  const name = asString(meta?.name);
  const author = asString(meta?.author);
  return {
    edition: { id: 'custom', ...(name ? { name } : {}), ...(author ? { author } : {}) },
    roles: script.filter((e) => e !== null).map(liveRole),
  };
};

/** A role's id as the site knows it: on the script by id or name, else among the official characters. */
export const liveRoleId = (role: string, characters: Character[] | null | undefined): string | null => {
  const key = normalizeId(role);
  const onScript = characters?.find((c) => c.id === key || normalizeId(c.name) === key);
  return onScript?.id ?? (OFFICIAL[key] ? key : null);
};

/**
 * The town square as a clocktower.live game state: every seat in order with
 * its life state, and a role only for Travelers, whose role is public. The
 * rest of the grimoire is the Storytellers' and stays empty.
 */
export const liveGameState = (
  rows: SquareRow[],
  nameOf: (row: SquareRow) => string,
  script: unknown,
  characters: Character[] | null | undefined,
): LiveGameState => ({
  bluffs: [null, null, null],
  ...liveEdition(script, characters),
  npcs: [],
  players: rows.map((row) => {
    const { seat } = row;
    const shown = seat.traveler ? (seat.apparentRole ?? seat.trueRole) : null;
    const roleId = shown ? liveRoleId(shown, characters) : null;
    const alignment = seat.traveler ? (seat.apparentAlignment ?? seat.trueAlignment) : null;
    const role: LivePlayer['role'] = roleId ? { id: roleId } : {};
    return {
      name: nameOf(row),
      id: '',
      connected: false,
      role,
      alignmentIndex: alignment === 'evil' ? 1 : 0,
      reminders: [],
      isVoteless: seat.state === 'spent',
      hasTwoVotes: false,
      hasResponded: {},
      isDead: seat.state !== 'alive',
      handRaised: false,
      pronouns: '',
    };
  }),
});

/**
 * One seat of an uploaded game state, reduced to what a Discord seat can
 * take. `token` is a Good or Evil reminder on the player, the site's
 * `alignmentIndex` being unreliable: the role's own alignment stands unless a
 * token says otherwise.
 */
export type LiveSeat = {
  name: string;
  role: string | null;
  dead: boolean;
  voteless: boolean;
  token: 'good' | 'evil' | null;
};

export type LiveParse = { ok: true; seats: LiveSeat[] } | { ok: false; reason: string };

const roleIdOf = (raw: unknown): string | null => {
  if (typeof raw === 'string') return normalizeId(raw) || null;
  if (raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string') {
    return normalizeId((raw as { id: string }).id) || null;
  }
  return null;
};

const sideOf = (raw: unknown): 'good' | 'evil' | null => {
  const word = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return word === 'good' || word === 'evil' ? word : null;
};

/** The Good or Evil reminder token on a player, by its role key or its name; both at once cancel out. */
export const tokenOf = (reminders: unknown): 'good' | 'evil' | null => {
  if (!Array.isArray(reminders)) return null;
  const found = new Set<'good' | 'evil'>();
  for (const reminder of reminders) {
    if (!reminder || typeof reminder !== 'object') continue;
    const r = reminder as { role?: unknown; name?: unknown };
    const side = sideOf(r.role) ?? sideOf(r.name);
    if (side) found.add(side);
  }
  return found.size === 1 ? [...found][0]! : null;
};

/**
 * A clocktower.live game state as the site copies it, read for its seats
 * alone: name, role, life and any alignment token. Lenient about the rest,
 * since the site's own format carries far more than a square needs.
 */
export const parseLiveGameState = (raw: unknown): LiveParse => {
  const players = raw && typeof raw === 'object' ? (raw as { players?: unknown }).players : undefined;
  if (!Array.isArray(players)) return { ok: false, reason: 'no players array; is this a clocktower.live game state?' };
  if (players.length === 0) return { ok: false, reason: 'the grimoire has no seats.' };

  const seats: LiveSeat[] = [];
  for (const [index, player] of players.entries()) {
    if (!player || typeof player !== 'object') return { ok: false, reason: `seat ${index + 1} is not a player.` };
    const p = player as Record<string, unknown>;
    seats.push({
      name: asString(p['name']) ?? `Seat ${index + 1}`,
      role: roleIdOf(p['role']),
      dead: p['isDead'] === true,
      voteless: p['isVoteless'] === true,
      token: tokenOf(p['reminders']),
    });
  }
  return { ok: true, seats };
};

/** What a seat takes from a live seat: its life state, and its role and alignment when the grimoire has one. */
export type LiveSeatPatch = {
  state: 'alive' | 'dead' | 'spent';
  trueRole?: string;
  trueAlignment?: 'good' | 'evil' | null;
  traveler?: boolean;
};

/**
 * The site's name for a role when the script or the official list knows it,
 * else the id as it came. The alignment is stored only as an override, so it
 * is written when a token on the player differs from the role's own.
 */
export const liveSeatPatch = (seat: LiveSeat, characters: Character[] | null | undefined): LiveSeatPatch => {
  const state = seat.dead ? (seat.voteless ? 'spent' : 'dead') : 'alive';
  if (!seat.role) return { state };

  const known = characters?.find((c) => c.id === seat.role) ?? null;
  const official = OFFICIAL[seat.role];
  const team = known?.team ?? official?.team ?? 'unknown';
  const name = known?.name ?? official?.name ?? seat.role;
  const natural =
    team === 'townsfolk' || team === 'outsider' ? 'good' : team === 'minion' || team === 'demon' ? 'evil' : null;

  return {
    state,
    trueRole: name,
    trueAlignment: seat.token && seat.token !== natural ? seat.token : null,
    traveler: team === 'traveler',
  };
};

const key = (name: string) => name.trim().toLowerCase();

/** Who sits in each live seat, by index: a participant id, or null for a seat left to nobody. */
export type LiveMap = Record<string, string | null>;

/** What a game keeps of the last matching: each seat name and who was put in it. */
export type LiveSeatMemory = Record<string, string | null>;

/**
 * A first guess at who sits where: the last matching's answer for a seat of
 * the same name, else a live seat named exactly as a player (nickname or
 * display name) is theirs. Each player is matched once.
 */
export const matchLiveSeats = (
  seats: LiveSeat[],
  players: { id: string; names: string[] }[],
  remembered: LiveSeatMemory | null = null,
): LiveMap => {
  const known = new Set(players.map((p) => p.id));
  const taken = new Set<string>();
  const map: LiveMap = {};
  for (const [index, seat] of seats.entries()) {
    const kept = remembered?.[seat.name];
    if (kept === null) {
      map[String(index)] = null;
      continue;
    }
    if (kept && known.has(kept) && !taken.has(kept)) {
      taken.add(kept);
      map[String(index)] = kept;
      continue;
    }
    const found = players.find((p) => !taken.has(p.id) && p.names.some((n) => key(n) === key(seat.name)));
    if (found) taken.add(found.id);
    map[String(index)] = found?.id ?? null;
  }
  return map;
};

/**
 * The last matching applied as it stands, when it still fits: the same seat
 * names as before, in any order (a swap is only an order), each distinct, and
 * everyone it names still a Player. Any other change brings the matching
 * pane back.
 */
export const rememberedMatch = (
  seats: LiveSeat[],
  remembered: LiveSeatMemory | null | undefined,
  players: Set<string>,
): LiveMap | null => {
  if (!remembered) return null;
  const names = seats.map((s) => s.name);
  if (new Set(names).size !== names.length) return null;
  if (names.length !== Object.keys(remembered).length) return null;
  if (!names.every((n) => n in remembered)) return null;
  if (!names.every((n) => remembered[n] === null || players.has(remembered[n]!))) return null;
  return Object.fromEntries(seats.map((s, i) => [String(i), remembered[s.name] ?? null]));
};

/** What to remember of a matching: each seat name and who was put in it. */
export const liveSeatMemory = (seats: LiveSeat[], map: LiveMap): LiveSeatMemory =>
  Object.fromEntries(seats.map((s, i) => [s.name, map[String(i)] ?? null]));
