import type { Client } from 'discord.js';
import { listViews } from '../../../../engine/discord/views/query';
import { getOrCreateGameSettings } from '../../../../drizzle/game-settings';
import { DuplicateNomination, insertNomination, listNominationsOfPhase } from '../../../../drizzle/nominations';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { listSeating, type SeatedPlayer } from '../../../../drizzle/seating';
import type { Game, GamePhase } from '../../../../schema/core/games.sql';
import type { Nomination } from '../../../../schema/core/nominations.sql';
import { dayChanged } from '../../views/nominations/events';
import { spawnByRoute } from '../create';
import { DAY_CARD, isOpen, NOMINATION_CARD, type Interaction } from './open';
import { publish } from './publish';
import { canNominate, kindFor, requiredVotes, voteOrder, type Refusal, type SeatRef } from './rules';
import { nominationChannel } from './thread';

type GameRow = typeof Game.$inferSelect;
type PhaseRow = typeof GamePhase.$inferSelect;
type NominationRow = typeof Nomination.$inferSelect;

/** The value the nominee picker uses for the Storyteller, who has no seat id. */
export const STORYTELLER = 'st';

export type NominateReason = Refusal | 'notSeated' | 'closed' | 'badTarget' | 'noChannel';
export type NominateResult = { ok: true; nomination: NominationRow } | { ok: false; reason: NominateReason };

export const seatRef = (row: SeatedPlayer): SeatRef => ({
  id: row.seat.id,
  seat: row.seat.seat,
  state: row.seat.state,
  traveler: row.seat.traveler,
});

/**
 * A player's own nomination: their seat is found from their membership and
 * the rest is `nominateFor`.
 */
export const nominate = async (
  client: Client,
  game: GameRow,
  phase: PhaseRow,
  actorMember: bigint,
  target: string,
  accusation: string,
  interaction: Interaction,
): Promise<NominateResult> => {
  const participant = await getParticipantByMember(game.id, actorMember);
  const seat = participant ? (await listSeating(game.id)).find((row) => row.seat.player === participant.id) : undefined;
  if (!seat) return { ok: false, reason: 'notSeated' };
  return nominateFor(client, game, phase, seat.seat.id, target, accusation, interaction);
};

/**
 * A nomination from a seat: checked against the day's rules, written with
 * its whole ballot, and given a card beside the day card. The database has
 * the last word on the once-a-day rules, so two at once cannot both land.
 * The seat is a parameter so a Storyteller may nominate on a player's behalf.
 */
export const nominateFor = async (
  client: Client,
  game: GameRow,
  phase: PhaseRow,
  plaintiffSeat: string,
  target: string,
  accusation: string,
  interaction: Interaction,
): Promise<NominateResult> => {
  if (!isOpen(phase)) return { ok: false, reason: 'closed' };

  // Every seat, empty ones included: a seat with no Discord player behind it
  // is a player of the grimoire all the same, run through the Storyteller.
  const rows = await listSeating(game.id);
  const actor = rows.find((row) => row.seat.id === plaintiffSeat);
  if (!actor) return { ok: false, reason: 'notSeated' };

  const defendant = target === STORYTELLER ? null : rows.find((row) => row.seat.id === target);
  if (defendant === undefined) return { ok: false, reason: 'badTarget' };

  const settings = await getOrCreateGameSettings(game.id);
  const today = await listNominationsOfPhase(phase.id);
  const refs = rows.map(seatRef);
  const verdict = canNominate(
    seatRef(actor),
    defendant ? seatRef(defendant) : null,
    today,
    settings.nominateStoryteller,
  );
  if (verdict !== true) return { ok: false, reason: verdict };

  const kind = kindFor(defendant ? seatRef(defendant) : null);
  const order = voteOrder(refs, actor.seat.id, defendant?.seat.id ?? null);
  const byId = new Map(rows.map((row) => [row.seat.id, row]));

  let nomination: NominationRow;
  try {
    nomination = await insertNomination(
      {
        game: game.id,
        phase: phase.id,
        kind,
        plaintiff: actor.seat.id,
        defendant: defendant?.seat.id ?? null,
        required: requiredVotes(kind, refs),
        accusation: accusation.trim() || null,
      },
      order.map((id, i) => ({ player: id, state: byId.get(id)!.seat.state, position: i + 1 })),
    );
  } catch (error) {
    if (error instanceof DuplicateNomination) {
      return {
        ok: false,
        reason: today.some((n) => n.plaintiff === actor.seat.id) ? 'alreadyNominated' : 'alreadyNominee',
      };
    }
    throw error;
  }

  // Beside the day card, wherever that is; the bound thread otherwise.
  const [dayCard] = await listViews({ route: DAY_CARD, entityId: phase.id });
  const fromCard = dayCard ? await client.channels.fetch(String(dayCard.channel)).catch(() => null) : null;
  const channel = fromCard && 'send' in fromCard ? fromCard : (await nominationChannel(client, game))?.channel;
  if (!channel) return { ok: false, reason: 'noChannel' };

  await spawnByRoute(
    NOMINATION_CARD,
    { interaction, channel },
    { entityId: nomination.id, ids: { gnomination: nomination.id, gnomday: phase.id, gconfig: game.id } },
  );
  await publish(client, [dayChanged(phase.id)]);

  return { ok: true, nomination };
};
