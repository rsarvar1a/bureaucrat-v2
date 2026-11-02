import { normalizeId, OFFICIAL, TEAM_ORDER, type Character, type NightNotes, type Team } from './characters';
import type { NightsJson } from './night';

/** `nights` is the order `_meta` gives, when it gives one. */
export type ParsedScript = {
  name: string | null;
  author: string | null;
  characters: Character[];
  nights: NightsJson | null;
};

export type ParseResult = { ok: true; script: ParsedScript } | { ok: false; reason: string };

const TEAMS = new Set<string>(['townsfolk', 'outsider', 'minion', 'demon', 'traveler', 'fabled', 'loric']);

const teamOf = (raw: unknown): Team | 'unknown' => {
  if (typeof raw !== 'string') return 'unknown';
  const team = raw.toLowerCase() === 'traveller' ? 'traveler' : raw.toLowerCase();
  return TEAMS.has(team) ? (team as Team) : 'unknown';
};

const asString = (raw: unknown): string | null => (typeof raw === 'string' && raw.trim() ? raw.trim() : null);

const asIds = (raw: unknown): string[] | null =>
  Array.isArray(raw) && raw.every((x) => typeof x === 'string') ? raw.map(normalizeId).filter(Boolean) : null;

// Only what the entry states: a homebrew character with a priority of 0 does
// not act, and one saying nothing about a night leaves it to the official data.
const nightNotes = (record: Record<string, unknown>): NightNotes | undefined => {
  const notes: NightNotes = {};
  if (typeof record['firstNight'] === 'number' && record['firstNight'] > 0) notes.first = record['firstNight'];
  if (typeof record['otherNight'] === 'number' && record['otherNight'] > 0) notes.other = record['otherNight'];
  if (typeof record['firstNightReminder'] === 'string') notes.firstReminder = record['firstNightReminder'];
  if (typeof record['otherNightReminder'] === 'string') notes.otherReminder = record['otherNightReminder'];
  return Object.keys(notes).length > 0 ? notes : undefined;
};

/**
 * The script tool's format: an array whose items are character ids or
 * objects carrying at least an `id`, with an optional `_meta` entry for the
 * script's name and author. Permissive about everything else, since the
 * format has grown by accretion; strict about the one thing that matters,
 * which is that every entry names a character.
 */
export const parseScript = (raw: unknown): ParseResult => {
  if (!Array.isArray(raw)) return { ok: false, reason: 'Expected a JSON array of characters.' };

  let name: string | null = null;
  let author: string | null = null;
  let nights: NightsJson | null = null;
  const seen = new Map<string, Character>();

  for (const [index, entry] of raw.entries()) {
    if (typeof entry === 'string') {
      const id = normalizeId(entry);
      if (!id) return { ok: false, reason: `Entry ${index + 1} is an empty id.` };
      const official = OFFICIAL[id];
      if (!seen.has(id)) {
        seen.set(
          id,
          official ? { id, name: official.name, team: official.team } : { id, name: entry, team: 'unknown' },
        );
      }
      continue;
    }

    if (!entry || typeof entry !== 'object') return { ok: false, reason: `Entry ${index + 1} is not a character.` };

    const record = entry as Record<string, unknown>;
    const rawId = asString(record['id']);
    if (!rawId) return { ok: false, reason: `Entry ${index + 1} has no id.` };

    if (rawId === '_meta') {
      name = asString(record['name']);
      author = asString(record['author']);
      const firstNight = asIds(record['firstNight']);
      const otherNight = asIds(record['otherNight']);
      if (firstNight || otherNight) nights = { firstNight, otherNight };
      continue;
    }

    const id = normalizeId(rawId);
    if (seen.has(id)) continue;

    const official = OFFICIAL[id];
    const night = nightNotes(record);
    seen.set(id, {
      id,
      name: asString(record['name']) ?? official?.name ?? rawId,
      team: record['team'] !== undefined ? teamOf(record['team']) : (official?.team ?? 'unknown'),
      ...(night ? { night } : {}),
    });
  }

  return { ok: true, script: { name, author, characters: [...seen.values()], nights } };
};

/** Characters in the order a select should list them: by team, then as the script had them. */
export const byTeam = (characters: Character[]): Character[] =>
  [...characters].sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team));

export const PAGE = 25;

export const pageCount = (n: number, size = PAGE): number => Math.max(1, Math.ceil(n / size));

export const pageOf = <T>(items: T[], page: number, size = PAGE): T[] => {
  const last = pageCount(items.length, size) - 1;
  const at = Math.min(Math.max(0, page), last);
  return items.slice(at * size, at * size + size);
};

export const isJsonUpload = (file: { name: string; contentType: string | null }) =>
  file.name.toLowerCase().endsWith('.json') || (file.contentType?.startsWith('application/json') ?? false);

export const isPdfUpload = (file: { name: string; contentType: string | null }) =>
  file.name.toLowerCase().endsWith('.pdf') || (file.contentType?.startsWith('application/pdf') ?? false);
