import type { SeatedPlayer } from '../../../drizzle/seating';
import type { PublishedSeat } from '../../../schema/core/games.sql';
import type { Seating } from '../../../schema/core/seating.sql';

/** What drawing a square takes of a seat: the live row and a published one both fit. */
export type SquareSeat = Pick<
  typeof Seating.$inferSelect,
  'seat' | 'nickname' | 'state' | 'traveler' | 'trueRole' | 'trueAlignment' | 'apparentRole' | 'apparentAlignment'
>;
export type SquareRow = { seat: SquareSeat; member: bigint | null };

/** The fields a "roles live" game lets through without a publish. */
const ROLE_FIELDS = ['traveler', 'trueRole', 'trueAlignment', 'apparentRole', 'apparentAlignment'] as const;

/** The seating as the players may see it, frozen at a publish. */
export const snapshot = (rows: SeatedPlayer[]): PublishedSeat[] =>
  rows.map(({ seat, member }) => ({
    id: seat.id,
    player: seat.player,
    member: member === null ? null : String(member),
    seat: seat.seat,
    nickname: seat.nickname,
    state: seat.state,
    traveler: seat.traveler,
    trueRole: seat.trueRole,
    trueAlignment: seat.trueAlignment,
    apparentRole: seat.apparentRole,
    apparentAlignment: seat.apparentAlignment,
  }));

const withLiveRoles = (published: PublishedSeat, live: SeatedPlayer | undefined): PublishedSeat => {
  if (!live) return published;
  const patched = { ...published };
  for (const field of ROLE_FIELDS) (patched as Record<string, unknown>)[field] = live.seat[field];
  return patched;
};

/**
 * The published square, with roles taken from the live seats when the game
 * says roles are live. A seat published and since removed keeps its published
 * roles; one added since is not shown until the next publish.
 */
export const publishedSquare = (
  published: PublishedSeat[] | null,
  live: SeatedPlayer[],
  rolesLive: boolean,
): SquareRow[] | null => {
  if (!published) return null;
  const liveById = new Map(live.map((row) => [row.seat.id, row]));
  return published.map((row) => {
    const { member, ...seat } = rolesLive ? withLiveRoles(row, liveById.get(row.id)) : row;
    return { seat, member: member === null ? null : BigInt(member) };
  });
};

/** The published seat of a participant, or the live one when roles are live and they are seated. */
export const ownSeat = (
  published: PublishedSeat[] | null,
  live: SeatedPlayer[],
  participant: string,
  rolesLive: boolean,
): SquareSeat | null => {
  const liveRow = live.find((row) => row.seat.player === participant);
  if (rolesLive && liveRow) return liveRow.seat;
  const row = published?.find((p) => p.player === participant);
  return row ? (rolesLive ? withLiveRoles(row, liveRow) : row) : null;
};

/** Whether the players see the seating as it stands, given what a publish would carry. */
export const isPublished = (published: PublishedSeat[] | null, live: SeatedPlayer[], rolesLive: boolean): boolean => {
  if (!published) return false;
  const liveById = new Map(live.map((row) => [row.seat.id, row]));
  const shown = rolesLive ? published.map((row) => withLiveRoles(row, liveById.get(row.id))) : published;
  return JSON.stringify(shown) === JSON.stringify(snapshot(live));
};
