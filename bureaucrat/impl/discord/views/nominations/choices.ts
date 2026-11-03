import type { APISelectMenuOption, Client } from 'discord.js';
import { injectCustomId } from '../../../../engine/discord/views/custom-id';
import type { StoredView } from '../../../../engine/discord/views/query';
import type { ViewContext } from '../../../../engine/discord/views/types';
import { getOrCreateGameSettings } from '../../../../drizzle/game-settings';
import { listNominationsOfPhase } from '../../../../drizzle/nominations';
import type { SeatedPlayer } from '../../../../drizzle/seating';
import type { Game } from '../../../../schema/core/games.sql';
import { STORYTELLER } from '../../games/nominations/nominate';
import type { OpenNomination } from '../../games/nominations/today';
import type { NominationRow } from '../../../../drizzle/nominations';
import { STATUS_MARK } from '../../games/nominations/format';
import type { Status } from '../../games/nominations/rules';
import type { BallotEntry } from '../../../../drizzle/votes';
import { roleLook, seatLabel, seatName, STATE_EMOTE, STATE_LABEL } from '../games/seating/render';
import { displayNames } from '../queue/members';

type GameRow = typeof Game.$inferSelect;

const asEmoji = (emote: { id: string; name: string; animated: boolean } | null) =>
  emote ? { emoji: { id: emote.id, name: emote.name, animated: emote.animated } } : {};

/**
 * Who may be nominated today, for the modal's select: the Storyteller when
 * allowed and not yet nominated, travelers (always open to an exile), then
 * every seated player without a nomination against them. Travelers first,
 * since a big game may not fit everyone in twenty-five.
 */
export const nomineeChoices = async (
  client: Client,
  game: GameRow,
  phaseId: string,
  rows: SeatedPlayer[],
): Promise<APISelectMenuOption[]> => {
  const [settings, today, names] = await Promise.all([
    getOrCreateGameSettings(game.id),
    listNominationsOfPhase(phaseId),
    displayNames(
      client,
      game.guild,
      rows.map((r) => r.member),
    ),
  ]);
  const look = roleLook(client, game.guild, null);
  const taken = new Set(today.filter((n) => n.kind !== 'exile').map((n) => n.defendant));

  return [
    ...(settings.nominateStoryteller && !today.some((n) => n.kind === 'storyteller')
      ? [{ label: 'The Storyteller', value: STORYTELLER, description: 'execution', ...asEmoji(look.emote('evil')) }]
      : []),
    ...rows
      .filter((row) => row.seat.traveler || !taken.has(row.seat.id))
      .sort((a, b) => Number(b.seat.traveler) - Number(a.seat.traveler))
      .map((row) => ({
        label: seatLabel(row, names).slice(0, 100),
        value: row.seat.id,
        description: row.seat.traveler ? 'Traveler · exile' : STATE_LABEL[row.seat.state],
        ...asEmoji(look.emote(STATE_EMOTE[row.seat.state])),
      })),
  ].slice(0, 25);
};

/** The living seats, for a Storyteller nominating on a player's behalf. */
export const accuserChoices = async (
  client: Client,
  game: GameRow,
  rows: SeatedPlayer[],
): Promise<APISelectMenuOption[]> => {
  const names = await displayNames(
    client,
    game.guild,
    rows.map((r) => r.member),
  );
  const look = roleLook(client, game.guild, null);
  return rows
    .filter((row) => row.seat.state === 'alive')
    .slice(0, 25)
    .map((row) => ({
      label: seatLabel(row, names).slice(0, 100),
      value: row.seat.id,
      description: row.seat.traveler ? 'Traveler' : STATE_LABEL[row.seat.state],
      ...asEmoji(look.emote(STATE_EMOTE[row.seat.state])),
    }));
};

/** Today's nominations with where each stands, for the Storyteller's block select; the one on the block preselected. */
export const blockChoices = async (
  client: Client,
  game: GameRow,
  rows: SeatedPlayer[],
  entries: { nomination: NominationRow; status: Status; tally: number }[],
): Promise<APISelectMenuOption[]> => {
  const names = await displayNames(
    client,
    game.guild,
    rows.map((r) => r.member),
  );
  const nameOf = (seatId: string | null) => {
    const row = rows.find((r) => r.seat.id === seatId);
    return row ? seatName(row, names) : 'the Storyteller';
  };
  return entries.slice(-25).map(({ nomination, status, tally }) => ({
    label: `${nameOf(nomination.defendant)}`.slice(0, 100),
    value: nomination.id,
    description: `${STATUS_MARK[status]} ${tally} of ${nomination.required} · ${nomination.kind}`.slice(0, 100),
    default: nomination.block,
  }));
};

/** The ballot lines not yet locked, for the Storyteller writing a seat's vote. */
export const ballotChoices = async (
  client: Client,
  game: GameRow,
  ballot: BallotEntry[],
): Promise<APISelectMenuOption[]> => {
  const open = ballot.filter((line) => !line.vote.locked);
  const names = await displayNames(
    client,
    game.guild,
    open.map((line) => line.member),
  );
  const look = roleLook(client, game.guild, null);
  return open.slice(0, 25).map((line) => ({
    label: seatLabel(line, names).slice(0, 100),
    value: line.seat.id,
    description: (line.vote.public ? `"${line.vote.public}"` : 'no vote yet').slice(0, 100),
    ...asEmoji(look.emote(STATE_EMOTE[line.vote.state])),
  }));
};

/** The open nominations, for a vote's select: `accuser → nominee`, newest last. */
export const openNominationChoices = async (
  client: Client,
  game: GameRow,
  rows: SeatedPlayer[],
  open: OpenNomination[],
): Promise<APISelectMenuOption[]> => {
  const names = await displayNames(
    client,
    game.guild,
    rows.map((r) => r.member),
  );
  const nameOf = (seatId: string | null) => {
    const row = rows.find((r) => r.seat.id === seatId);
    return row ? seatLabel(row, names) : 'the Storyteller';
  };
  return open.slice(-25).map(({ nomination, ballot }) => ({
    label: `${nameOf(nomination.plaintiff)} → ${nameOf(nomination.defendant)}`.slice(0, 100),
    value: nomination.id,
    description: `${nomination.kind} · ${ballot.filter((v) => v.vote.locked).length}/${ballot.length} locked`,
  }));
};

/**
 * A context for showing one of a view's modals from outside the view - a
 * slash command standing in for the card's button. The modal's custom id
 * is all `show` reads, and the submit then dispatches to the card as if its
 * button had been pressed.
 */
export const entryContext = <S>(row: StoredView): ViewContext<S> =>
  ({ view: injectCustomId<S>({ ...row, state: row.state as S }) }) as unknown as ViewContext<S>;
