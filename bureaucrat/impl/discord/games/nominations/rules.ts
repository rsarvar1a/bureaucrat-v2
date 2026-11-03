import type { LifeState } from '../seating';

/** What a nomination asks for; mirrors the `NominationKind` enum. */
export type NominationKind = 'execution' | 'exile' | 'storyteller';

export type Status = 'open' | 'passed' | 'failed';

/** A seat as the rules see it: its number for the order, its state and travel for the roll. */
export type SeatRef = { id: string; seat: number; state: LifeState; traveler: boolean };

/** What a nomination made today looks like to the once-a-day rules. */
export type TodayNomination = { kind: NominationKind; plaintiff: string; defendant: string | null };

export type Refusal = 'notAlive' | 'alreadyNominated' | 'alreadyNominee' | 'storytellerOff';

/** The Storyteller has no seat; a traveler is exiled, not executed. */
export const kindFor = (defendant: SeatRef | null): NominationKind =>
  defendant === null ? 'storyteller' : defendant.traveler ? 'exile' : 'execution';

/**
 * Clockwise is increasing seat number, wrapping after the highest. The vote
 * starts at the seat after the nominee and goes round to end on the nominee;
 * with nobody in the dock (the Storyteller nominated) it goes round from the
 * accuser to end on the accuser. Gaps in the numbers do not matter: only the
 * order does.
 */
export const voteOrder = (seats: SeatRef[], plaintiff: string, defendant: string | null): string[] => {
  const ordered = [...seats].sort((a, b) => a.seat - b.seat).map((s) => s.id);
  const anchor = ordered.indexOf(defendant ?? plaintiff);
  if (anchor === -1) return ordered;
  return [...ordered.slice(anchor + 1), ...ordered.slice(0, anchor + 1)];
};

/**
 * Half the living players, rounded up, to execute; half of everyone seated to
 * exile, since the dead may vote on an exile. Travelers count as players.
 */
export const requiredVotes = (kind: NominationKind, seats: SeatRef[]): number => {
  const roll = kind === 'exile' ? seats.length : seats.filter((s) => s.state === 'alive').length;
  return Math.ceil(roll / 2);
};

type Locked = { locked: boolean; yes: boolean | null; weight: number | null };

/** What the locked hands count for so far. A no weighs nothing; a yes weighs what the Storyteller said. */
export const tally = (votes: Locked[]): number =>
  votes.reduce((sum, v) => (v.locked && v.yes ? sum + (v.weight ?? 1) : sum), 0);

export const nextToLock = (votes: { position: number; locked: boolean }[]): number | null => {
  const open = votes.filter((v) => !v.locked).map((v) => v.position);
  return open.length === 0 ? null : Math.min(...open);
};

/**
 * Open until the Storyteller finalizes the count: locks are provisional
 * before that, and a count that has reached the threshold can still fall
 * back under a Thief, so nothing is called early.
 */
export const statusOf = (votes: Locked[], required: number, finalized: boolean): Status => {
  if (!finalized) return 'open';
  return tally(votes) >= required ? 'passed' : 'failed';
};

/** Finalizing needs every hand locked. */
export const mayFinalize = (votes: Locked[]): boolean => votes.length > 0 && votes.every((v) => v.locked);

/**
 * Anyone may vote on an exile; otherwise a spent ghost vote is spent. The
 * state is the seat's as the nomination was made (`Vote.state`): a
 * nomination is a point in time, and a player who dies after it was made
 * is alive for its purposes.
 */
export const mayVote = (kind: NominationKind, state: LifeState): boolean => kind === 'exile' || state !== 'spent';

/** A player dead when the nomination was made spends their ghost vote on a yes to anything but an exile. */
export const spendsGhostVote = (kind: NominationKind, state: LifeState, yes: boolean): boolean =>
  yes && state === 'dead' && kind !== 'exile';

/**
 * The day's block: the passing execution (or Storyteller nomination) with
 * the most votes. A tie leaves nobody there; exiles never go there.
 */
export const blockAfter = (
  done: { id: string; kind: NominationKind; status: Status; tally: number }[],
): string | null => {
  const passed = done.filter((n) => n.kind !== 'exile' && n.status === 'passed');
  if (passed.length === 0) return null;
  const top = Math.max(...passed.map((n) => n.tally));
  const leaders = passed.filter((n) => n.tally === top);
  return leaders.length === 1 ? leaders[0]!.id : null;
};

/**
 * Whether `actor` may nominate `defendant` (null for the Storyteller) today.
 * The dead nominate nobody. Calling for an exile is free: it costs no
 * nomination and a traveler may face any number. Otherwise each player
 * nominates once and is nominated once; self-nomination is allowed.
 */
export const canNominate = (
  actor: SeatRef,
  defendant: SeatRef | null,
  today: TodayNomination[],
  allowStoryteller: boolean,
): true | Refusal => {
  if (actor.state !== 'alive') return 'notAlive';
  const kind = kindFor(defendant);
  if (kind === 'exile') return true;
  if (kind === 'storyteller' && !allowStoryteller) return 'storytellerOff';

  const counted = today.filter((n) => n.kind !== 'exile');
  if (counted.some((n) => n.plaintiff === actor.id)) return 'alreadyNominated';
  if (kind === 'storyteller') return counted.some((n) => n.kind === 'storyteller') ? 'alreadyNominee' : true;
  return counted.some((n) => n.defendant === defendant!.id) ? 'alreadyNominee' : true;
};

/** How a yes is written when it does not count for one: `×3`, `−1`, `×0`. */
export const weightLabel = (weight: number | null): string => {
  if (weight === null || weight === 1) return '';
  return weight < 0 ? `−${Math.abs(weight)}` : `×${weight}`;
};
