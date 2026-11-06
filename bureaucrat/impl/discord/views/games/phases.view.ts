import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  selectRow,
  select,
  v2,
} from '../../../../engine/discord/elements';
import type { HandlerResult, ViewContext, ViewInteraction } from '../../../../engine/discord/views/types';
import { currentPhase, listPhases, setPhases } from '../../../../drizzle/game-phases';
import { listNominationsOfPhase } from '../../../../drizzle/nominations';
import { getSeatedPlayer } from '../../../../drizzle/seating';
import { toast } from '../../../../engine/discord/reply';
import { getGame } from '../../../../drizzle/games';
import { getScriptSummary } from '../../../../drizzle/scripts';
import { parseNights, SCOPE_LABEL, SCOPES, type Scope } from '../../games/script/night';
import { listSeating } from '../../../../drizzle/seating';
import {
  closeDay,
  closeOpenDays,
  isOpen,
  openNominations,
  reopenDay,
  repaintDay,
  teardownPhases,
} from '../../games/nominations/open';
import { namer } from '../naming';
import { parseScript } from '../../games/script/parse';
import { nightOrderText } from './night-order';
import { roleLook } from './seating/render';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { FIRST, key, label, next, ordinal, parse, previous, sequence, shift, type PhaseRef } from '../../games/phases';
import { closeAllWhispers, reopenNeighbourWhispers } from '../../games/whispers/close';
import { GameEvents } from './events';
import { S } from '../../../../strings';

type PhasesState = { scope: Scope };

const scopeOf = (view: { state: PhasesState | null }): Scope =>
  SCOPES.find((s) => s === view.state?.scope) ?? SCOPES[0]!;

const current = async (gameId: string): Promise<PhaseRef> => (await currentPhase(gameId)) ?? FIRST;

const moveTo = async (
  interaction: ViewInteraction,
  ctx: ViewContext<PhasesState>,
  target: PhaseRef | null,
): Promise<HandlerResult> => {
  if (!interaction.isMessageComponent()) return;
  await interaction.deferUpdate();

  if (!target) return { action: 'render' };

  const gameId = ctx.view.entityId!;
  const before = await currentPhase(gameId);
  const wanted = sequence(target);
  const keep = new Set(wanted.map(key));

  // A backward move deletes the phases beyond the target, and their
  // nominations with them: their cards come down and spent ghost votes return first.
  const doomed = (await listPhases(gameId)).filter((row) => !keep.has(key(row))).map((row) => row.id);
  await teardownPhases(interaction.client, gameId, doomed);

  await setPhases(gameId, wanted);

  // Leaving a day closes its nominations; standing still leaves them be.
  const after = await currentPhase(gameId);
  await closeOpenDays(interaction.client, gameId, after && before?.id === after.id ? after.id : undefined);

  // Votes follow the current day, so the day left and the day returned to both
  // repaint. Leaving one still open already did, through its close.
  if (after && before?.id !== after.id) {
    if (before?.nominationsClosedAt) await repaintDay(interaction.client, before.id);
    if (after.phase === 'day' && after.nominationsOpenedAt) await repaintDay(interaction.client, after.id);
  }

  // Night falls on every whisper: threads lock, town voices come back. Day
  // breaks on the neighbours' standing threads.
  if (after && before?.id !== after.id) {
    const game = await getGame(gameId);
    if (game && after.phase === 'night') await closeAllWhispers(interaction.client, game, 'night');
    if (game && after.phase === 'day') await reopenNeighbourWhispers(interaction.client, game);
  }
  await ctx.notify(GameEvents.Changed);

  return { action: 'render' };
};

export default createView<PhasesState>()({
  id: 'gphases',
  idParams: [],
  events: {},
  defaultState: { scope: 'apparent' },
  subscribesTo: { render: [GameEvents.Changed], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const now = await current(view.entityId!);

    // A night shows the Storyteller the order to wake the script in.
    let order: string | null = null;
    if (now.phase === 'night') {
      const [game, script, seated] = await Promise.all([
        getGame(view.entityId!),
        getScriptSummary(view.entityId!),
        listSeating(view.entityId!),
      ]);
      const parsed = script?.json ? parseScript(script.json) : null;
      const nights = script?.nights ? parseNights(script.nights) : null;
      const roles = (pick: (seat: (typeof seated)[number]['seat']) => string | null) =>
        seated.map((row) => pick(row.seat)).filter((role): role is string => role !== null);
      order = nightOrderText(
        parsed?.ok ? parsed.script : null,
        nights?.ok ? nights.nights : null,
        now.on === 1 ? 'first' : 'other',
        roleLook(client, game?.guild ?? 0n, parsed?.ok ? parsed.script.characters : null),
        scopeOf(view),
        { trueRoles: roles((seat) => seat.trueRole), apparentRoles: roles((seat) => seat.apparentRole) },
      );
    }

    // Everything played so far plus the one phase ahead, so a jump forward
    // is one step and a jump back is any distance. The last 25 fit a select.
    const choices = sequence(next(now)).slice(-25);

    // A day carries its nominations: how many, who is on the block, and the
    // button that opens, closes or reopens them.
    const day = now.phase === 'day' ? await currentPhase(view.entityId!) : undefined;
    let summary: string | null = null;
    let nominationsButton: ReturnType<typeof button> | null = null;
    if (day) {
      const nominations = await listNominationsOfPhase(day.id);
      const onBlock = nominations.find((n) => n.block);
      const nominee = onBlock?.defendant ? await getSeatedPlayer(onBlock.defendant) : null;
      const game = await getGame(view.entityId!);
      const name = game ? await namer(client, game.guild, view.channel, [nominee?.member]) : null;
      const blockText = onBlock ? ` · ${nominee && name ? name(nominee.member) : 'the Storyteller'} on the block` : '';
      summary = `${nominations.length} nomination${nominations.length === 1 ? '' : 's'} today${blockText}.`;
      nominationsButton = !day.nominationsOpenedAt
        ? button(view.customId('nominations'), 'Open nominations', ButtonStyle.Primary)
        : isOpen(day)
          ? button(view.customId('nominations'), 'Close nominations', ButtonStyle.Secondary)
          : button(view.customId('nominations'), 'Reopen nominations', ButtonStyle.Secondary);
    }

    return v2(
      linear(
        text('### Phases'),
        ...(order ? [text(order)] : []),
        ...(summary ? [text(summary)] : []),
        separator(),
        ...(nominationsButton ? [buttonRow(nominationsButton)] : []),
        // A row holds five buttons and the phase row is full, so the scope
        // cycle (all roles, in play, apparent) takes the row above it.
        ...(order
          ? [buttonRow(button(view.customId('scope'), SCOPE_LABEL[scopeOf(view)], ButtonStyle.Secondary))]
          : []),
        buttonRow(
          button(view.customId('day-back'), S.common.nudgeFaces.downBig, ButtonStyle.Secondary).setDisabled(
            ordinal(now) <= 2,
          ),
          button(view.customId('back'), S.common.nudgeFaces.down, ButtonStyle.Secondary).setDisabled(
            previous(now) === null,
          ),
          button(view.customId('now'), `It is ${label(now)}...`, ButtonStyle.Primary).setDisabled(true),
          button(view.customId('next'), S.common.nudgeFaces.up, ButtonStyle.Secondary),
          button(view.customId('day-forward'), S.common.nudgeFaces.upBig, ButtonStyle.Secondary),
        ),
        selectRow(
          select(view.customId('jump'), 'Jump to a phase').addOptions(
            choices.map((ref) => ({ label: label(ref), value: key(ref), default: key(ref) === key(now) })),
          ),
        ),
      ).setAccentColor(now.phase === 'night' ? accent.neutral : accent.warning),
    );
  },

  interactions: {
    'day-back': async (interaction, ctx) => moveTo(interaction, ctx, shift(await current(ctx.view.entityId!), -2)),
    back: async (interaction, ctx) => moveTo(interaction, ctx, previous(await current(ctx.view.entityId!))),
    next: async (interaction, ctx) => moveTo(interaction, ctx, next(await current(ctx.view.entityId!))),
    'day-forward': async (interaction, ctx) => moveTo(interaction, ctx, shift(await current(ctx.view.entityId!), 2)),
    // The readout between the arrows: disabled, so never pressed.
    now: async () => undefined,

    // Open, close or reopen the day's nominations, by where the day stands.
    nominations: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const [game, day] = await Promise.all([getGame(ctx.view.entityId!), currentPhase(ctx.view.entityId!)]);
      if (!game || !day || day.phase !== 'day') return { action: 'render' };

      if (!day.nominationsOpenedAt) {
        const result = await openNominations(interaction.client, game, day, interaction);
        if (result.outcome === 'no-channel') {
          await toast.followUp(interaction, S.errors.nominationRefused['noChannel']!, { accent: accent.warning });
        } else if (result.fellBack) {
          await toast.followUp(interaction, S.common.nominationThreadFellBack, { accent: accent.warning });
        }
      } else if (isOpen(day)) {
        await closeDay(interaction.client, day.id);
      } else {
        await reopenDay(interaction.client, day.id);
      }

      return { action: 'render' };
    },

    scope: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ scope: SCOPES[(SCOPES.indexOf(scopeOf(ctx.view)) + 1) % SCOPES.length]! });
      return { action: 'render' };
    },

    jump: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      return moveTo(interaction, ctx, parse(interaction.values[0] ?? ''));
    },
  },
});
