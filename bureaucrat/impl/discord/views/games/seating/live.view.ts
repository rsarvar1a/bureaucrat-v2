import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  select,
  selectRow,
  v2,
} from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import type { InteractionHandler } from '../../../../../engine/discord/views/types';
import { getGame } from '../../../../../drizzle/games';
import { listParticipants } from '../../../../../drizzle/participants';
import { getScriptSummary } from '../../../../../drizzle/scripts';
import { listSeating } from '../../../../../drizzle/seating';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { liveSeatPatch, type LiveMap, type LiveSeat } from '../../../games/clocktower-live';
import { applyLiveState } from '../../../games/live-seating';
import { ensureStThreadsIfRunning } from '../../../games/st-threads';
import { displayNames } from '../../queue/members';
import { GameEvents } from '../events';
import { characterChoices } from './roles';
import { S } from '../../../../../strings';

/** The grimoire's seats, who each is matched to (by index), and the page of selects shown. */
type LiveState = { seats: LiveSeat[]; map: LiveMap; page: number };

/** Four selects and the button row: five rows, the most a message holds. */
export const SEATS_PER_PAGE = 4;

const dismiss = dismissButton<LiveState>()({ action: 'dismiss' });

const pageCount = (seats: number) => Math.max(1, Math.ceil(seats / SEATS_PER_PAGE));

const pageOf = (view: { state: LiveState | null }) =>
  Math.min(Math.max(0, view.state?.page ?? 0), pageCount(view.state?.seats.length ?? 0) - 1);

const turn =
  (by: number): InteractionHandler<LiveState> =>
  async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    await interaction.deferUpdate();
    await ctx.updateState({ page: pageOf(ctx.view) + by });
    return { action: 'render' };
  };

// The readout between the arrows is disabled and never arrives.
const noop: InteractionHandler<LiveState> = async () => undefined;

/**
 * Ephemeral, opened by Upload clocktower.live on the seating window: one
 * select per seat of the grimoire, naming the player who sits there, four to
 * a page. Apply writes each matched seat's life state and role onto that
 * player's seat; a seat matched to nobody is skipped, since a grimoire may
 * hold seats that are nobody's. The matching is remembered: the next upload
 * with the same seat names skips this pane.
 */
export default createView<LiveState>()({
  id: 'gseatlive',
  idParams: [],
  events: {},
  defaultState: { seats: [], map: {}, page: 0 },
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text(S.errors.notHere)).setAccentColor(accent.danger));

    const [players, rows, script] = await Promise.all([
      listParticipants(game.id, 'Player'),
      listSeating(game.id),
      getScriptSummary(game.id),
    ]);
    const names = await displayNames(
      client,
      game.guild,
      players.map((p) => p.member),
    );
    const characters = characterChoices(script?.json);
    const seatOf = (participant: string) => rows.find((row) => row.seat.player === participant)?.seat.seat;

    const seats = view.state?.seats ?? [];
    const map = view.state?.map ?? {};
    const page = pageOf(view);
    const pages = pageCount(seats.length);
    const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

    const options = (index: number) =>
      players.slice(0, 25).map((p) => {
        const seat = seatOf(p.id);
        return {
          label: names[String(p.member)] ?? String(p.member),
          description: seat === undefined ? 'unseated' : `Seat ${seat}`,
          value: p.id,
          default: map[String(index)] === p.id,
        };
      });

    const placeholder = (seat: LiveSeat, index: number) => {
      const patch = liveSeatPatch(seat, characters);
      const bits = [`${index + 1}. ${seat.name}`, patch.trueRole ?? 'no role'];
      if (patch.state !== 'alive') bits.push(patch.state === 'spent' ? 'dead, no vote' : 'dead');
      return bits.join(' · ').slice(0, 100);
    };

    const shown = seats
      .map((seat, index) => ({ seat, index }))
      .slice(page * SEATS_PER_PAGE, page * SEATS_PER_PAGE + SEATS_PER_PAGE);
    const matched = Object.values(map).filter(Boolean).length;

    return v2(
      linear(
        text('### Grimoire'),
        text(`-# ${matched} of ${seats.length} matched.`),
        separator(),
        ...shown.map(({ seat, index }) =>
          selectRow(
            select(customId(`pick:${index}`), placeholder(seat, index))
              .setMinValues(0)
              .addOptions(options(index)),
          ),
        ),
        buttonRow(
          button(customId('prev'), '<', ButtonStyle.Secondary).setDisabled(page === 0),
          button(customId('page'), `${page + 1} / ${pages}`, ButtonStyle.Secondary).setDisabled(true),
          button(customId('next'), '>', ButtonStyle.Secondary).setDisabled(page >= pages - 1),
          button(customId('apply'), 'Apply', ButtonStyle.Primary).setDisabled(matched === 0),
          dismiss.button(view),
        ),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,

    prev: turn(-1),
    page: noop,
    next: turn(1),

    apply: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const seats = ctx.view.state?.seats ?? [];
      const map = ctx.view.state?.map ?? {};
      if (!Object.values(map).some(Boolean)) {
        await toast.followUp(interaction, S.games.liveNothingMatched, { accent: accent.warning });
        return { action: 'render' };
      }

      const written = await applyLiveState(ctx.view.entityId!, seats, map);
      await ensureStThreadsIfRunning(interaction.client, await getGame(ctx.view.entityId!));
      if (written > 0) await ctx.notify(GameEvents.Changed);
      await toast.followUp(interaction, S.games.liveApplied(written), { accent: accent.success });
      return { action: 'destroy' };
    },

    // `pick:<index>`: a player is matched to one seat at most, so picking
    // them here takes them off any other seat.
    '*': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const [verb, at] = ctx.action.split(':');
      const index = Number(at);
      const seats = ctx.view.state?.seats ?? [];
      if (verb !== 'pick' || !Number.isInteger(index) || index < 0 || index >= seats.length) {
        return { action: 'render' };
      }

      const picked = interaction.values[0] ?? null;
      const map = { ...(ctx.view.state?.map ?? {}) };
      if (picked) for (const key of Object.keys(map)) if (map[key] === picked) map[key] = null;
      map[String(index)] = picked;
      await ctx.updateState({ map });

      return { action: 'render' };
    },
  },
});
