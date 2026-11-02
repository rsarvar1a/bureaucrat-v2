export type Seat = { id: string; seat: number };

export type LifeState = 'alive' | 'dead' | 'spent';

/** Seats run 1..n in array order, whatever numbers came in. */
export const renumber = <T extends Seat>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.seat - b.seat).map((row, i) => ({ ...row, seat: i + 1 }));

export const moveSeat = <T extends Seat>(rows: T[], id: string, to: number): T[] => {
  const ordered = renumber(rows);
  const from = ordered.findIndex((row) => row.id === id);
  if (from === -1) return ordered;

  const target = Math.min(Math.max(1, to), ordered.length) - 1;
  const [moving] = ordered.splice(from, 1);
  ordered.splice(target, 0, moving!);

  return ordered.map((row, i) => ({ ...row, seat: i + 1 }));
};

export const swapSeats = <T extends Seat>(rows: T[], a: string, b: string): T[] => {
  const ordered = renumber(rows);
  const i = ordered.findIndex((row) => row.id === a);
  const j = ordered.findIndex((row) => row.id === b);
  if (i === -1 || j === -1 || i === j) return ordered;

  [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];

  return ordered.map((row, k) => ({ ...row, seat: k + 1 }));
};

export const removeSeat = <T extends Seat>(rows: T[], id: string): T[] => renumber(rows.filter((row) => row.id !== id));

export const appendSeats = <T extends Seat>(rows: T[], ids: string[]): (T | Seat)[] => {
  const ordered: (T | Seat)[] = renumber(rows);
  for (const id of ids) ordered.push({ id, seat: ordered.length + 1 });
  return ordered;
};

/**
 * The named players, in the order given, take the seats those same players
 * hold now, top of the circle first; every other seat stays where it is. A
 * grimoire's order lands on the square without moving anyone it does not name.
 */
export const arrangeSeats = <T extends Seat & { player: string | null }>(rows: T[], players: string[]): T[] => {
  const ordered = renumber(rows);
  const byPlayer = new Map(ordered.filter((row) => row.player !== null).map((row) => [row.player!, row]));
  const named = players.filter((id) => byPlayer.has(id));
  const slots = ordered.filter((row) => row.player !== null && named.includes(row.player));
  let at = 0;
  return ordered.map((row) => {
    if (!slots.includes(row)) return row;
    const taker = byPlayer.get(named[at++]!)!;
    return { ...taker, seat: row.seat };
  });
};

const CYCLE: Record<LifeState, LifeState> = { alive: 'dead', dead: 'spent', spent: 'alive' };

/** Alive, dead with a ghost vote, dead having spent it, and round again. */
export const cycleState = (state: LifeState): LifeState => CYCLE[state];
