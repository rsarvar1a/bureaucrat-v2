import nightsheet from './data/nightsheet.json';
import { normalizeId, OFFICIAL, type Character } from './characters';
import type { ParsedScript } from './parse';

export type Night = 'first' | 'other';

/**
 * Whose entries are listed: every character on the script, only the roles in play (seated
 * players' true roles), or those plus the roles players believe they have. Markers always show.
 */
export type Scope = 'all' | 'inplay' | 'apparent';

/** In the order the button cycles them, starting from the first. */
export const SCOPES: readonly Scope[] = ['apparent', 'all', 'inplay'];

export const SCOPE_LABEL: Record<Scope, string> = { all: 'All roles', inplay: 'In play', apparent: 'Apparent' };

/** The roles seated players hold and show, by name, for the in-play and apparent scopes. */
export type RolesInPlay = { trueRoles: Iterable<string>; apparentRoles: Iterable<string> };

/** An explicit order per night, by character id: the shape of `_meta.firstNight`/`otherNight` and of the official night sheet. */
export type NightsJson = { firstNight: string[] | null; otherNight: string[] | null };

/** `emote` is the name the entry's emote is looked up by, when it is not the entry's own name. */
export type NightEntry = { id: string; name: string; reminder: string; emote?: string };

export type NightOrder =
  | { ok: true; entries: NightEntry[] }
  // `mixed`: official and homebrew characters whose orders cannot be interleaved without a
  // list; `unspecced`: a homebrew character acts at night but carries no priority.
  | { ok: false; reason: 'mixed' | 'unspecced' };

const SHEET: Record<Night, string[]> = { first: nightsheet.firstNight, other: nightsheet.otherNight };

/** The night sheet's entries that are not characters, with the Storyteller's reminder for each. */
export const MARKERS: Record<string, { name: string; emote?: string; first: string | null; other: string | null }> = {
  dusk: {
    name: 'Dusk',
    first: 'Check that all eyes are closed. Some Travellers & Fabled act.',
    other: 'Check that all eyes are closed. Some Travellers & Fabled act.',
  },
  minioninfo: {
    name: 'Minion info',
    emote: 'minion',
    first: 'If there are 7 or more players, wake all Minions: show the THIS IS THE DEMON token and point to the Demon.',
    other: null,
  },
  demoninfo: {
    name: 'Demon info',
    emote: 'demon',
    first:
      'If there are 7 or more players, wake the Demon: show the THESE ARE YOUR MINIONS token and point to all Minions; show the THESE CHARACTERS ARE NOT IN PLAY token and 3 not-in-play good character tokens.',
    other: null,
  },
  dawn: {
    name: 'Dawn',
    first: 'Wait a few seconds. Call for eyes open.',
    other: 'Wait a few seconds. Call for eyes open.',
  },
};

const idList = (raw: unknown): string[] | null =>
  Array.isArray(raw) && raw.every((x) => typeof x === 'string') ? raw.map(normalizeId).filter(Boolean) : null;

/**
 * A night order file: an object with `firstNight` and/or `otherNight` arrays of ids, which is
 * what the official night sheet and a script's `_meta` both look like.
 */
export const parseNights = (raw: unknown): { ok: true; nights: NightsJson } | { ok: false; reason: string } => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'Expected an object with firstNight and otherNight lists.' };
  }
  const record = raw as Record<string, unknown>;
  const nights = { firstNight: idList(record['firstNight']), otherNight: idList(record['otherNight']) };
  if (!nights.firstNight && !nights.otherNight) {
    return { ok: false, reason: 'Neither firstNight nor otherNight is a list of character ids.' };
  }
  return { ok: true, nights };
};

/** Reminder text as the app stores it, with its token placeholders removed. */
export const cleanReminder = (text: string): string =>
  text
    .replace(/:reminder:/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const reminderOf = (character: Character, night: Night): string | null => {
  const own = night === 'first' ? character.night?.firstReminder : character.night?.otherReminder;
  if (own !== undefined) return own;
  const official = OFFICIAL[character.id];
  return (night === 'first' ? official?.firstNightReminder : official?.otherNightReminder) ?? null;
};

const priorityOf = (character: Character, night: Night): number | undefined =>
  night === 'first' ? character.night?.first : character.night?.other;

/**
 * The order the Storyteller wakes the script at night, from the first source that
 * has one: a night order file, the script's `_meta`, then derived. Derived works for a
 * script that is fully official (the night sheet, filtered to the script) or fully
 * specced homebrew (every acting character carries a priority); anything in between
 * needs a list, since the sheet's positions and homebrew priorities are not on one scale.
 * The in-play scopes keep only the characters whose name (or id) matches a seated
 * player's true role, or their apparent role as well.
 */
export const nightOrder = (
  script: ParsedScript,
  explicit: NightsJson | null,
  night: Night,
  scope: Scope = 'all',
  inPlay: RolesInPlay = { trueRoles: [], apparentRoles: [] },
): NightOrder => {
  const onScript = new Map(script.characters.map((c) => [c.id, c]));
  const listed = (night === 'first' ? explicit?.firstNight : explicit?.otherNight) ?? null;
  const fromMeta = (night === 'first' ? script.nights?.firstNight : script.nights?.otherNight) ?? null;

  let order: string[];
  if (listed) order = listed;
  else if (fromMeta) order = fromMeta;
  else {
    const acting = script.characters.filter((c) => priorityOf(c, night) !== undefined || reminderOf(c, night));
    const numbered = acting.filter((c) => priorityOf(c, night) !== undefined);
    const official = acting.filter((c) => priorityOf(c, night) === undefined && SHEET[night].includes(c.id));
    if (acting.length !== numbered.length + official.length) return { ok: false, reason: 'unspecced' };
    if (numbered.length > 0 && official.length > 0) return { ok: false, reason: 'mixed' };

    order =
      numbered.length > 0
        ? [
            'dusk',
            ...(night === 'first' ? ['minioninfo', 'demoninfo'] : []),
            ...[...numbered].sort((a, b) => priorityOf(a, night)! - priorityOf(b, night)!).map((c) => c.id),
            'dawn',
          ]
        : SHEET[night].filter((id) => onScript.has(id) || id in MARKERS);
  }

  const wanted = new Set<string>();
  if (scope !== 'all') for (const role of inPlay.trueRoles) wanted.add(normalizeId(role));
  if (scope === 'apparent') for (const role of inPlay.apparentRoles) wanted.add(normalizeId(role));
  const shown = (character: Character) =>
    scope === 'all' || wanted.has(character.id) || wanted.has(normalizeId(character.name));

  const entries: NightEntry[] = [];
  for (const id of order) {
    const marker = MARKERS[id];
    if (marker) {
      const reminder = night === 'first' ? marker.first : marker.other;
      if (reminder) entries.push({ id, name: marker.name, reminder, ...(marker.emote ? { emote: marker.emote } : {}) });
      continue;
    }
    const character = onScript.get(id);
    if (!character || !shown(character)) continue;
    entries.push({ id, name: character.name, reminder: cleanReminder(reminderOf(character, night) ?? '') });
  }
  return { ok: true, entries };
};
