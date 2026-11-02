import type { SquareRow } from '../../../games/published';
import type { LifeState } from '../../../games/seating';
import { emoteFinder, type Emote, type EmoteOf, type EmoteSource } from '../../../games/emotes';
import {
  defaultAlignment,
  roleEmoteNames,
  teamLookup,
  type Alignment,
  type TeamOf,
} from '../../../games/script/alignment';
import type { Character } from '../../../games/script/characters';
import type { Name } from '../../naming';

/** What drawing a role takes: the emotes in reach, and which team a role name is. */
export type RoleLook = { emote: EmoteOf; teamOf: TeamOf };

export const roleLook = (
  client: EmoteSource,
  guild: bigint | string,
  characters: Character[] | null | undefined,
): RoleLook => ({
  emote: emoteFinder(client, guild),
  teamOf: teamLookup(characters),
});

export const STATE_LABEL: Record<LifeState, string> = { alive: 'alive', dead: 'dead', spent: 'ghost' };

export const TRAVELER_MARK = '✈';

/** `n. name`, which is all a select label has room to say. */
export const EMPTY_SEAT = 'Empty seat';

/** What a seat is called, plain: the nickname, else the display name, else `Empty seat`. */
export const seatName = (row: SquareRow, names: Record<string, string>): string =>
  row.seat.nickname ?? (row.member === null ? EMPTY_SEAT : (names[String(row.member)] ?? String(row.member)));

export const seatLabel = (row: SquareRow, names: Record<string, string>): string =>
  `${row.seat.seat}. ${seatName(row, names)}`;

/** The emote named for a state in Bureaucrat's Office: alive, dead, novote. */
export const STATE_EMOTE: Record<LifeState, string> = { alive: 'alive', dead: 'dead', spent: 'novote' };

/** A role's emote in its alignment (the team's unless the seat says otherwise), falling back to the plain icon. */
export const roleEmote = (role: string, look: RoleLook, alignment: Alignment | null = null): Emote | null =>
  look.emote(roleEmoteNames(role, alignment ?? defaultAlignment(look.teamOf(role))));

/** The emote alone when one is in reach, the name otherwise. */
export const roleTag = (role: string, look: RoleLook, alignment: Alignment | null = null): string =>
  roleEmote(role, look, alignment)?.mention ?? role;

export const stateTag = (state: LifeState, emote: EmoteOf): string =>
  emote(STATE_EMOTE[state])?.mention ?? STATE_LABEL[state];

export const who = (row: SquareRow, name: Name): string => {
  // An empty seat has nobody to name; its nickname, if any, is what it is called.
  if (row.member === null) return `**${row.seat.nickname ?? EMPTY_SEAT}**`;
  return `${name(row.member)}${row.seat.nickname ? ` (${row.seat.nickname})` : ''}`;
};

/** ` the <true> (as <apparent>)`, or nothing when no true role is set. */
export const roleOf = (row: SquareRow, look: RoleLook): string => {
  if (!row.seat.trueRole) return '';
  const real = ` the ${roleTag(row.seat.trueRole, look, row.seat.trueAlignment)}`;
  return row.seat.apparentRole && row.seat.apparentRole !== row.seat.trueRole
    ? `${real} (as ${roleTag(row.seat.apparentRole, look, row.seat.apparentAlignment)})`
    : real;
};

/**
 * One line per seat, top of the circle first:
 * `n. <state> <player> (nickname) the <true> (as <apparent>)`, as a Markdown ordered list so the
 * numbers and state emotes line up. `revealed` says whose roles are written: everyone's for
 * the Storytellers, travelers' only for the players.
 */
export const townSquare = (
  rows: SquareRow[],
  look: RoleLook,
  name: Name,
  revealed: (row: SquareRow) => boolean = () => true,
): string =>
  rows.length === 0
    ? '*Nobody is seated yet.*'
    : rows
        .map(
          (row) =>
            `${row.seat.seat}. ${stateTag(row.seat.state, look.emote)} ${who(row, name)}${revealed(row) ? roleOf(row, look) : ''}`,
        )
        .join('\n');
