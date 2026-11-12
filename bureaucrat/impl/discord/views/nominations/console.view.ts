import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { confirmButton } from '../../../../engine/discord/components/confirm';
import { bump, stepperRow, type Nudge, type Stepper } from '../../../../engine/discord/components/stepper';
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
} from '../../../../engine/discord/elements';
import { replySafely, toast } from '../../../../engine/discord/reply';
import { logger } from '../../../../utilities/logger';
import type { InteractionHandler } from '../../../../engine/discord/views/types';
import { getPhase } from '../../../../drizzle/game-phases';
import { getGame } from '../../../../drizzle/games';
import { getNomination } from '../../../../drizzle/nominations';
import { getScriptSummary } from '../../../../drizzle/scripts';
import { getSeatedPlayer } from '../../../../drizzle/seating';
import { listVotes } from '../../../../drizzle/votes';
import { inGuild } from '../../guards';
import { storytellsNomination } from '../../guards/nominations';
import { consoleBallot, headline, statusLine } from '../../games/nominations/format';
import { defaultRest, finalize, lockSeats, unlockSeats, type LockResult } from '../../games/nominations/lock';
import { resetNomination } from '../../games/nominations/reset';
import { closeNomination } from '../../games/nominations/close';
import { mayFinalize, nextToLock, statusOf, tally, weightLabel } from '../../games/nominations/rules';
import { GameEvents } from '../games/events';
import { roleEmote, roleLook, seatLabel, STATE_EMOTE, stateTag, who, type RoleLook } from '../games/seating/render';
import { displayNames } from '../queue/members';
import { characterChoices } from '../games/seating/roles';
import { namer } from '../naming';
import { ballotChoices } from './choices';
import { NominationEvents } from './events';
import { accusationModal, defenseModal, proxyVote, type ConsoleState } from './modals';
import { S } from '../../../../strings';

/**
 * What the next lock will be: a plain yes or no, a Bureaucrat's three or a
 * Thief's minus one when they are on script, or a custom weight from the row.
 */
type Mode = NonNullable<ConsoleState['mode']>;

const WEIGHT: Stepper = { slug: 'w', label: 'Weight', min: -3, max: 9, step: 1, bigStep: 3 };

/** The ways to lock, in the select's order; the travelers only when on script, wearing their own icons. */
const MODES: { id: Mode; label: string; emoji?: string; traveler?: string }[] = [
  { id: 'yes', label: 'Yes', emoji: '✅' },
  { id: 'no', label: 'No', emoji: '❌' },
  { id: 'bureaucrat', label: 'Bureaucrat', traveler: 'bureaucrat' },
  { id: 'thief', label: 'Thief', traveler: 'thief' },
  { id: 'custom', label: 'Custom', emoji: '❔' },
];

/** The option's icon: a unicode mark, or the traveler's own emote when the game has it. */
const modeEmoji = (mode: (typeof MODES)[number], look: RoleLook) => {
  if (mode.emoji) return { emoji: { name: mode.emoji } };
  const emote = mode.traveler ? roleEmote(mode.traveler, look) : null;
  return emote ? { emoji: { id: emote.id, name: emote.name, animated: emote.animated } } : {};
};

const isMode = (value: string | undefined): value is Mode => MODES.some((m) => m.id === value);

const dismiss = dismissButton<ConsoleState>()({ action: 'dismiss' });

/**
 * Rerolls the nomination against the grimoire as it stands (see `reset.ts`):
 * for the Storyteller who has just killed the accuser in Seating. Red, and
 * asked twice.
 */
const reset = confirmButton<ConsoleState>()({
  action: 'reset',
  label: 'Reset nomination',
  onConfirm: async (ctx, interaction) => {
    await ctx.updateState({ 'confirming:reset': false });
    const nomination = await getNomination(ctx.view.entityId!);
    if (!nomination) return;
    const result = await resetNomination(interaction.client, nomination);
    if (!result.ok) await toast.followUp(interaction, S.errors.nominationGone, { accent: accent.warning });
  },
});

/**
 * Takes the nomination back as if it was never made (see `close.ts`): the
 * card comes down, this console with it, and both players are free to
 * nominate or be nominated again. Red, and asked twice.
 */
const close = confirmButton<ConsoleState>()({
  action: 'close',
  label: 'Close nomination',
  onConfirm: async (ctx, interaction) => {
    const nomination = await getNomination(ctx.view.entityId!);
    const result = nomination ? await closeNomination(interaction.client, nomination) : null;
    await toast.followUp(interaction, result?.ok ? S.games.nominationClosed : S.errors.nominationGone, {
      accent: result?.ok ? accent.success : accent.warning,
    });
  },
});

const modeOf = (view: { state: ConsoleState | null }): Mode => view.state?.mode ?? 'yes';
const weightOf = (view: { state: ConsoleState | null }): number => view.state?.weight ?? 1;

/** What a lock in this mode writes on the ballot. */
const lockFor = (mode: Mode, weight: number): { yes: boolean; weight: number } => {
  switch (mode) {
    case 'yes':
      return { yes: true, weight: 1 };
    case 'no':
      return { yes: false, weight: 0 };
    case 'bureaucrat':
      return { yes: true, weight: 3 };
    case 'thief':
      return { yes: true, weight: -1 };
    case 'custom':
      return { yes: true, weight };
  }
};

/** `Lock ✅`, `Lock ❌`, `Lock ✅ ×3`: the button says what it will do. */
const lockLabel = (lock: { yes: boolean; weight: number }): string =>
  lock.yes ? `Lock ✅${weightLabel(lock.weight) ? ` ${weightLabel(lock.weight)}` : ''}` : 'Lock ❌';

const REFUSALS: Record<Extract<LockResult, { ok: false }>['reason'], string> = {
  nothingToLock: S.errors.nothingToLock,
  handsUp: S.errors.handsUp,
  alreadyFinal: S.errors.alreadyFinal,
};

const seatsOf = (view: { state: ConsoleState | null }): string[] => view.state?.seats ?? [];

/** How a hand stands, for the seat picker's description. */
const handNote = (vote: { locked: boolean; yes: boolean | null; weight: number | null }): string =>
  !vote.locked
    ? 'up'
    : vote.yes
      ? `locked ✅${weightLabel(vote.weight) ? ` ${weightLabel(vote.weight)}` : ''}`
      : 'locked ❌';

const asEmoji = (emote: { id: string; name: string } | null) =>
  emote ? { emoji: { id: emote.id, name: emote.name } } : {};

const act =
  (
    run: (
      client: Parameters<InteractionHandler<ConsoleState>>[0]['client'],
      nomination: NonNullable<Awaited<ReturnType<typeof getNomination>>>,
      ctx: Parameters<InteractionHandler<ConsoleState>>[1],
    ) => Promise<LockResult>,
  ): InteractionHandler<ConsoleState> =>
  async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    // The lock is the point; the console is only its mirror. If Discord no
    // longer knows this message, the work still runs and the cards still
    // repaint, and the press is answered with a fresh reply instead.
    const acknowledged = await interaction.deferUpdate().then(
      () => true,
      (error: unknown) => {
        logger.warn({ message: `Could not acknowledge ${ctx.action} on console ${ctx.view.id}.`, error });
        return false;
      },
    );

    const nomination = await getNomination(ctx.view.entityId!);
    if (!nomination) return { action: 'destroy' };

    const result = await run(interaction.client, nomination, ctx);
    if (!acknowledged) {
      await replySafely(interaction, {
        content: result.ok ? S.common.viewGone : REFUSALS[result.reason],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    if (!result.ok) await toast.followUp(interaction, REFUSALS[result.reason], { accent: accent.warning });
    return { action: 'render' };
  };

/**
 * The Storyteller's console for one nomination, ephemeral beside its card:
 * the whole ballot as the card writes it, private votes beneath, and the
 * lock. Pick the seats, say what the lock will be (yes, no, a Bureaucrat's
 * three or a Thief's minus one when on script, or a custom weight, which
 * brings up the `<< < > >>` row) and Lock; Unlock takes a pick back; Default
 * ❌ brings every hand still up down as a no. Locks are provisional until
 * Finalize calls the count; a change after that is pushed through at once.
 */
export default createView<ConsoleState>()({
  id: 'gnomst',
  idParams: [],
  events: {},
  defaultState: { mode: 'yes', weight: 1, seats: [] },
  subscribesTo: { render: [NominationEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytellsNomination] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const nomination = await getNomination(view.entityId!);
    const [game, phase] = nomination
      ? await Promise.all([getGame(nomination.game), getPhase(nomination.phase)])
      : [undefined, undefined];
    if (!nomination || !game || !phase) {
      return v2(linear(text(S.errors.nominationGone), separator(), dismiss.row(view)).setAccentColor(accent.neutral));
    }

    const [ballot, script, accuser, nominee] = await Promise.all([
      listVotes(nomination.id),
      getScriptSummary(game.id),
      getSeatedPlayer(nomination.plaintiff),
      nomination.defendant ? getSeatedPlayer(nomination.defendant) : null,
    ]);
    const name = await namer(client, game.guild, view.channel, [
      accuser?.member,
      nominee?.member,
      ...ballot.map((v) => v.member),
    ]);
    const look = roleLook(client, game.guild, null);
    const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

    const votes = ballot.map((v) => v.vote);
    const finalized = nomination.finalizedAt !== null;
    const status = statusOf(votes, nomination.required, finalized);
    const next = nextToLock(votes) !== null;
    const mode = modeOf(view);
    const lock = lockFor(mode, weightOf(view));
    const picked = new Set(seatsOf(view));
    const names = await displayNames(
      client,
      game.guild,
      ballot.map((v) => v.member),
    );

    const onScript = new Set((characterChoices(script?.json) ?? []).map((c) => c.id));
    const modes = MODES.filter((m) => !m.traveler || onScript.has(m.traveler));

    // The card's ballot, each hand's private vote under it.
    const hands = consoleBallot(
      ballot.map((v) => ({
        position: v.vote.position,
        locked: v.vote.locked,
        yes: v.vote.yes,
        weight: v.vote.weight,
        public: v.vote.public,
        private: v.vote.private,
        name: who(v, name),
        state: stateTag(v.vote.state, look.emote),
      })),
      nomination.required,
    ).join('\n');

    return {
      ...v2(
        linear(
          text(
            `### ${headline(nomination.kind, accuser ? who(accuser, name) : '*an empty seat*', nominee ? who(nominee, name) : null)}`,
          ),
          text(statusLine(status, tally(votes), nomination.required, nomination.block)),
          separator(),
          text(`${hands || '*Nobody is seated to vote.*'}`),
          separator(),
          buttonRow(
            button(customId('write'), 'Write a vote for a seat', ButtonStyle.Primary).setDisabled(!next),
            button(customId('accusation'), 'Accusation', ButtonStyle.Secondary),
            button(customId('defense'), 'Defense', ButtonStyle.Secondary),
          ),
          // The seats to lock or unlock next; the pick clears once used.
          selectRow(
            select(customId('seats'), 'Pick which players to lock')
              .setMinValues(0)
              .setMaxValues(Math.min(25, Math.max(1, ballot.length)))
              .addOptions(
                ballot.slice(0, 25).map((v) => ({
                  label: seatLabel(v, names).slice(0, 100),
                  value: v.seat.id,
                  description: handNote(v.vote),
                  default: picked.has(v.seat.id),
                  ...asEmoji(look.emote(STATE_EMOTE[v.vote.state])),
                })),
              ),
          ),
          selectRow(
            select(customId('mode'), 'Pick a vote').addOptions(
              modes.map((m) => ({ label: m.label, value: m.id, default: m.id === mode, ...modeEmoji(m, look) })),
            ),
          ),
          buttonRow(
            button(customId('lock'), lockLabel(lock), lock.yes ? ButtonStyle.Success : ButtonStyle.Danger).setDisabled(
              picked.size === 0,
            ),
            button(customId('unlock'), 'Unlock', ButtonStyle.Secondary).setDisabled(picked.size === 0),
            button(customId('lock-rest'), 'Default ❌', ButtonStyle.Secondary).setDisabled(!next),
            button(customId('finalize'), 'Finalize', ButtonStyle.Primary).setDisabled(finalized || !mayFinalize(votes)),
          ),
          ...(mode === 'custom' ? [stepperRow(customId, WEIGHT, weightOf(view))] : []),
          buttonRow(reset.button(view), close.button(view), dismiss.button(view)),
          ...(reset.isConfirming(view) ? [reset.confirmRow(view)] : []),
          ...(close.isConfirming(view) ? [close.confirmRow(view)] : []),
        ).setAccentColor(accent.brand),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...dismiss.interactions,
    ...reset.interactions,
    ...close.interactions,
    ...proxyVote.interactions,
    ...accusationModal.interactions,
    ...defenseModal.interactions,

    // The texts, on anyone's behalf: a Storyteller is not bound by the first lock.
    accusation: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const nomination = await getNomination(ctx.view.entityId!);
      if (!nomination) return;
      await accusationModal.show(interaction, ctx, { values: { accusation: nomination.accusation ?? '' } });
    },
    defense: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const nomination = await getNomination(ctx.view.entityId!);
      if (!nomination) return;
      await defenseModal.show(interaction, ctx, { values: { defense: nomination.defense ?? '' } });
    },

    // The Storyteller's pen for an empty seat, or a player who needs a hand.
    write: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const nomination = await getNomination(ctx.view.entityId!);
      const game = nomination ? await getGame(nomination.game) : undefined;
      if (!nomination || !game) return;
      const seat = await ballotChoices(interaction.client, game, await listVotes(nomination.id));
      if (seat.length === 0) {
        await toast.ephemeral(interaction, S.errors.nothingToLock, { accent: accent.warning });
        return;
      }
      await proxyVote.show(interaction, ctx, { options: { seat } });
    },

    lock: act(async (client, nomination, ctx) => {
      const result = await lockSeats(
        client,
        nomination,
        seatsOf(ctx.view),
        lockFor(modeOf(ctx.view), weightOf(ctx.view)),
      );
      if (result.ok) await ctx.updateState({ seats: [] });
      return result;
    }),
    unlock: act(async (client, nomination, ctx) => {
      const result = await unlockSeats(client, nomination, seatsOf(ctx.view));
      if (result.ok) await ctx.updateState({ seats: [] });
      return result;
    }),
    'lock-rest': act((client, nomination) => defaultRest(client, nomination)),
    finalize: act((client, nomination) => finalize(client, nomination)),

    seats: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ seats: interaction.values });
      return { action: 'render' };
    },

    mode: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      const picked = interaction.values[0];
      if (isMode(picked)) await ctx.updateState({ mode: picked });
      return { action: 'render' };
    },

    // `bump:w:<nudge>` from the weight row.
    '*': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      const [verb, slug, nudge] = ctx.action.split(':');
      if (verb !== 'bump' || slug !== WEIGHT.slug) return { action: 'render' };
      const next = bump(WEIGHT, weightOf(ctx.view), nudge as Nudge);
      if (next !== null) await ctx.updateState({ weight: next });
      return { action: 'render' };
    },
  },
});
