import type { WinnerInput } from '../../../drizzle/game-outcomes';
import type { SeatedPlayer } from '../../../drizzle/seating';
import { defaultAlignment, type Alignment, type TeamOf } from './script/alignment';

/** What a multicolour game calls one of its results. */
export const colourTitle = (position: number): string => `Colour ${position}`;

/**
 * The side a seat is on as the game ends: the Storyteller's override if set,
 * else the team of the true role. A Traveler or an unknown role with no
 * override is on neither side.
 */
export const sideOf = (seat: SeatedPlayer['seat'], teamOf: TeamOf): Alignment | null =>
  seat.trueAlignment ?? defaultAlignment(teamOf(seat.trueRole));

/** The seats a declared winner selects by default: everyone on that side. */
export const defaultWinners = (rows: SeatedPlayer[], winner: Alignment, teamOf: TeamOf): string[] =>
  rows.filter((row) => row.member !== null && sideOf(row.seat, teamOf) === winner).map((row) => row.seat.id);

/** The record for the picked seats, with the role and side frozen as they stand now. */
export const winnersFrom = (rows: SeatedPlayer[], picked: string[], teamOf: TeamOf): WinnerInput[] =>
  rows
    .filter((row) => row.member !== null && picked.includes(row.seat.id))
    .map((row) => ({
      participant: row.seat.player,
      member: row.member!,
      role: row.seat.trueRole,
      alignment: sideOf(row.seat, teamOf),
    }));
