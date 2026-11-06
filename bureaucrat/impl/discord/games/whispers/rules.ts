import type { GameSettings } from '../../../../schema/core/games.sql';

type Settings = Pick<
  typeof GameSettings.$inferSelect,
  'whisperMode' | 'whispersPerDay' | 'asyncWhispersPerDay' | 'travelerWhispers' | 'groupWhispers' | 'neighbourWhispers'
>;

export type Budget = { total: number; async: number };

/**
 * How many Minions the base counts seat at a table of this many players,
 * travelers aside: one up to nine, two to twelve, three from thirteen. A
 * table smaller than the game allows is read as the smallest one.
 */
export const minionsFor = (players: number): number => (players >= 13 ? 3 : players >= 10 ? 2 : 1);

/** The whispers a day gives when the Storytellers leave it to the table: one per evil player, the Demon counted. */
export const defaultWhispers = (players: number): number => minionsFor(players) + 1;

/** The day's whisper count as set, or as the table gives it when unset. */
export const whispersPerDay = (settings: Pick<Settings, 'whispersPerDay'>, players: number): number =>
  settings.whispersPerDay ?? defaultWhispers(players);

/**
 * A day's allowance. Synchronous games have no async; asynchronous games are
 * nothing but; hybrid games take the async count out of the day's total.
 * `players` is how many sit at the table, travelers aside, for a count left
 * to the table.
 */
export const budget = (settings: Settings, players: number): Budget => {
  const total = whispersPerDay(settings, players);
  switch (settings.whisperMode) {
    case 'sync':
      return { total, async: 0 };
    case 'async':
      return { total: settings.asyncWhispersPerDay, async: settings.asyncWhispersPerDay };
    case 'hybrid':
      return { total, async: Math.min(settings.asyncWhispersPerDay, total) };
  }
};

export type Whisperer = { id: string; traveler: boolean };

/**
 * What each participant pays: one per other participant, except that with the
 * traveler rule a regular player pays nothing for the travelers among them,
 * and a free (neighbour) whisper costs nobody anything.
 */
export const costs = (participants: Whisperer[], travelerRule: boolean, free: boolean): Map<string, number> =>
  new Map(
    participants.map((p) => [
      p.id,
      free
        ? 0
        : participants.filter((other) => other.id !== p.id && !(travelerRule && !p.traveler && other.traveler)).length,
    ]),
  );

/** Whether a whisper gets the traveler rule: a hybrid game's async whisper never does. */
export const travelerRuleApplies = (
  settings: Pick<Settings, 'whisperMode' | 'travelerWhispers'>,
  async: boolean,
): boolean => settings.travelerWhispers && !(settings.whisperMode === 'hybrid' && async);

export type Spent = { total: number; async: number };

/** Whether a participant can afford one more at this cost, on both counters when it is async. */
export const affordable = (spent: Spent, cost: number, async: boolean, allowance: Budget): boolean =>
  spent.total + cost <= allowance.total && (!async || spent.async + cost <= allowance.async);

/**
 * Whether a whisper keeps this member out of town: it is open and synchronous,
 * not a neighbours' standing thread, and they have not ended their part.
 */
export const restricts = (
  whisper: { state: string; async: boolean; free: boolean },
  part: { endedAt: Date | null },
): boolean => whisper.state === 'accepted' && !whisper.async && !whisper.free && part.endedAt === null;

/**
 * What a member owes once their whisper goes async: in a hybrid game one per
 * other member, the traveler rule no longer counting; elsewhere what they paid.
 */
export const promotedCost = (mode: Settings['whisperMode'], paid: number, members: number): number =>
  mode === 'hybrid' ? members - 1 : paid;

/**
 * Whether a member can take an open whisper async: the full cost has to fit
 * the async counter, and the total has to cover whatever the traveler rule let
 * them off when it opened. The rest of the total was spent then.
 */
export const promotable = (spent: Spent, paid: number, cost: number, allowance: Budget): boolean =>
  spent.async + cost <= allowance.async && (cost === paid || spent.total + cost - paid <= allowance.total);

/**
 * Who is still in a whisper once a member leaves it: everyone whose part has
 * not ended, the leaver aside. One or none left means the whisper is over and
 * the last one out with it; two or more carry on without the leaver.
 */
export const remainingAfter = (members: { participant: string; endedAt: Date | null }[], leaver: string): string[] =>
  members.filter((m) => m.participant !== leaver && m.endedAt === null).map((m) => m.participant);

/**
 * Whether a closed whisper's thread locks. Two seated neighbours keep theirs
 * open as their standing channel when neighbour whispers are on; everyone else's locks.
 */
export const lockOnClose = (neighbourRule: boolean, seats: (number | undefined)[], count: number): boolean => {
  if (!neighbourRule || seats.length !== 2) return true;
  const [a, b] = seats;
  return a === undefined || b === undefined || !neighbours(a, b, count);
};

/** Two seats are neighbours when they are adjacent round the table of `count` seats. */
export const neighbours = (a: number, b: number, count: number): boolean =>
  count >= 2 && a !== b && (Math.abs(a - b) === 1 || (count > 2 && Math.abs(a - b) === count - 1));

/** The limit on Discord's own channel names. */
const NAME_LIMIT = 100;

const PREFIX = (free: boolean): string => (free ? 'Neighbours -' : 'Whisper -');

/** `Neighbours - Ann and Bob` for a neighbour whisper, `Whisper - Ann, Bob, Cat` for any other. */
export const whisperThreadName = (names: string[], free = false): string => {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const pair = free && clean.length === 2;
  const people = pair ? `${clean[0]} and ${clean[1]}` : clean.join(', ');
  return `${PREFIX(pair)} ${people}`.slice(0, NAME_LIMIT).trimEnd();
};

/** A member's own title for the thread, kept behind the prefix so it still reads as a whisper. */
export const renamedWhisperThread = (free: boolean, title: string): string =>
  `${PREFIX(free)} ${title.trim()}`.slice(0, NAME_LIMIT).trimEnd();

/** The tag a whisper thread carries: its participant set, so the next whisper between the same people reuses it. */
export const setTag = (participantIds: string[]): string => [...participantIds].sort().join(',');
