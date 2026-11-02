import type { PhaseRef } from '../../../drizzle/game-phases';

export type { PhaseRef };

/** Every game opens on the first night. */
export const FIRST: PhaseRef = { phase: 'night', on: 1 };

/**
 * A phase's place in play order, from 1: Night 1, Day 1, Night 2, Day 2, ...
 *
 * The arithmetic lives here and nowhere else, so "next", "back", "jump to"
 * and the row reconciliation all agree on what comes after what.
 */
export const ordinal = (ref: PhaseRef): number => ref.on * 2 - (ref.phase === 'night' ? 1 : 0);

export const fromOrdinal = (n: number): PhaseRef => ({ phase: n % 2 === 1 ? 'night' : 'day', on: Math.ceil(n / 2) });

export const next = (ref: PhaseRef): PhaseRef => fromOrdinal(ordinal(ref) + 1);

/** Null at Night 1: there is nothing before the game begins. */
export const previous = (ref: PhaseRef): PhaseRef | null => (ordinal(ref) <= 1 ? null : fromOrdinal(ordinal(ref) - 1));

export const label = (ref: PhaseRef): string => `${ref.phase === 'night' ? 'Night' : 'Day'} ${ref.on}`;

/** Night 1 up to and including `upTo`: the rows a game at that phase has. */
export const sequence = (upTo: PhaseRef): PhaseRef[] =>
  Array.from({ length: ordinal(upTo) }, (_, i) => fromOrdinal(i + 1));

/** A phase as a select value and back. */
export const key = (ref: PhaseRef): string => `${ref.phase}:${ref.on}`;

export const parse = (value: string): PhaseRef | null => {
  const [phase, on] = value.split(':');
  const n = Number(on);
  if ((phase !== 'night' && phase !== 'day') || !Number.isInteger(n) || n < 1) return null;
  return { phase, on: n };
};

/** `by` phases along, clamped at Night 1; ±2 is a whole day. */
export const shift = (ref: PhaseRef, by: number): PhaseRef => fromOrdinal(Math.max(1, ordinal(ref) + by));
