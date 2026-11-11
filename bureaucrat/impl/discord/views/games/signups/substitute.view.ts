import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { confirmButton, type ConfirmState } from '../../../../../engine/discord/components/confirm';
import { accent, text, separator, linear, select, selectRow, v2 } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { getGame } from '../../../../../drizzle/games';
import { listSeating, listUnseatedPlayers } from '../../../../../drizzle/seating';
import { listSignups } from '../../../../../drizzle/signups';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { substitute, type Incoming } from '../../../games/substitute';
import { displayNames } from '../../queue/members';
import { namer } from '../../naming';
import { GameEvents } from '../events';
import { EMPTY_SEAT, seatLabel } from '../seating/render';
import { S } from '../../../../../strings';

type SubstituteState = { out: string | null; in: string | null } & ConfirmState<'substitute'>;

const parseIncoming = (value: string | null | undefined): Incoming | null => {
  const [kind, id] = (value ?? '').split(':');
  return id && (kind === 's' || kind === 'p') ? { kind: kind === 's' ? 'signup' : 'participant', id } : null;
};

const REFUSALS: Record<string, string> = {
  'no-seat': 'That seat is gone.',
  'no-incoming': 'That candidate is gone.',
  'incoming-seated': S.errors.incomingSeated,
  'incoming-not-player': 'Only a Player can take a seat.',
};

const swap = confirmButton<SubstituteState>()({
  action: 'substitute',
  label: 'Substitute',
  style: ButtonStyle.Primary,
  onConfirm: async (ctx, interaction) => {
    const game = await getGame(ctx.view.entityId!);
    const out = ctx.view.state?.out;
    const incoming = parseIncoming(ctx.view.state?.in);
    const result = game && out && incoming ? await substitute(interaction.client, game, out, incoming) : null;

    await ctx.updateState({ 'confirming:substitute': false, out: null, in: null });
    await ctx.notifyAll(GameEvents.Changed);

    if (!result) return;
    if (!result.ok) {
      await toast.followUp(interaction, REFUSALS[result.reason] ?? 'That substitution could not be made.', {
        accent: accent.warning,
      });
      return;
    }

    const { joined, failed } = result.threads;
    const name = await namer(interaction.client, game!.guild, interaction.channelId, [
      result.incoming.member,
      result.outgoing?.member,
    ]);
    await toast.followUp(
      interaction,
      `${name(result.incoming.member)} takes ${result.outgoing ? `over from ${name(result.outgoing.member)}` : 'the empty seat'}: joined ${joined} thread(s)` +
        (failed.length > 0 ? `, could not join ${failed.length}.` : '.'),
      { accent: failed.length > 0 ? accent.warning : accent.success, timeoutMs: 15_000 },
    );
  },
});

export default createView<SubstituteState>()({
  id: 'gsubstitute',
  idParams: [],
  events: {},
  defaultState: { out: null, in: null },
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text('Game not found.')).setAccentColor(accent.danger));

    const [seating, pending, unseated] = await Promise.all([
      listSeating(game.id),
      listSignups(game.id, 'Player'),
      listUnseatedPlayers(game.id),
    ]);
    const names = await displayNames(client, game.guild, [
      ...seating.map((r) => r.member),
      ...pending.map((s) => s.member),
      ...unseated.map((p) => p.member),
    ]);
    const name = (member: bigint | null) => (member === null ? EMPTY_SEAT : (names[String(member)] ?? String(member)));

    const candidates = [
      ...pending.map((s) => ({ value: `s:${s.id}`, label: `${name(s.member)} · applied` })),
      ...unseated.map((p) => ({ value: `p:${p.id}`, label: `${name(p.member)} · unseated player` })),
    ].slice(0, 25);

    const out = seating.find((r) => r.seat.id === view.state?.out) ?? null;
    const incoming = candidates.find((c) => c.value === view.state?.in) ?? null;
    const ready = !!out && !!incoming;

    const summary =
      out && incoming
        ? `**${incoming.label.split(' · ')[0]}** takes seat ${out.seat.seat} from **${name(out.member)}**, with every thread they were in.`
        : 'You can use this menu to substitute a pending player for an outgoing player.';

    return v2(
      linear(
        text('### Substitute'),
        text(summary),
        separator(),
        selectRow(
          select(view.customId('out'), seating.length === 0 ? 'Nobody is seated...' : 'Seated player going out')
            .setDisabled(seating.length === 0)
            .addOptions(
              seating.length === 0
                ? [{ label: '—', value: 'none' }]
                : seating.map((r) => ({
                    label: seatLabel(r, names),
                    value: r.seat.id,
                    default: r.seat.id === out?.seat.id,
                  })),
            ),
        ),
        selectRow(
          select(view.customId('in'), candidates.length === 0 ? 'Nobody is on standby...' : 'Who comes in')
            .setDisabled(candidates.length === 0)
            .addOptions(
              candidates.length === 0
                ? [{ label: '—', value: 'none' }]
                : candidates.map((c) => ({ ...c, default: c.value === incoming?.value })),
            ),
        ),
        swap.isConfirming(view) && ready
          ? swap.confirmRow(view)
          : swap.row(view).setComponents(swap.button(view).setDisabled(!ready)),
      ),
    );
  },

  interactions: {
    ...swap.interactions,

    out: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ out: interaction.values[0] ?? null, 'confirming:substitute': false });
      return { action: 'render' };
    },

    in: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ in: interaction.values[0] ?? null, 'confirming:substitute': false });
      return { action: 'render' };
    },
  },
});
