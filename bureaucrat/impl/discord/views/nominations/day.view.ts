import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { listViews } from '../../../../engine/discord/views/query';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getPhase } from '../../../../drizzle/game-phases';
import { getGame } from '../../../../drizzle/games';
import { listNominationsOfPhase } from '../../../../drizzle/nominations';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { listSeating } from '../../../../drizzle/seating';
import { listVotes } from '../../../../drizzle/votes';
import { inGuild } from '../../guards';
import { isStorytellerOf } from '../../guards/game';
import { storytellsDay } from '../../guards/nominations';
import { actorOf } from '../../access';
import { label } from '../../games/phases';
import { BLOCK_PANE, isOpen, NOMINATION_CARD } from '../../games/nominations/open';
import { headline, STATUS_MARK } from '../../games/nominations/format';
import { statusOf, tally } from '../../games/nominations/rules';
import { GameEvents } from '../games/events';
import { who } from '../games/seating/render';
import { namer } from '../naming';
import { accuserChoices, nomineeChoices } from './choices';
import { NominationEvents } from './events';
import { dayVote, nominateModal, proxyNominateModal, type Empty } from './modals';
import { S } from '../../../../strings';

const link = (guild: bigint, channel: bigint, message: bigint) =>
  `https://discord.com/channels/${guild}/${channel}/${message}`;

/** The day, its game and the caller's seat, refusing ephemerally when the caller may not act. */
const standing = async (
  interaction: Parameters<typeof toast.ephemeral>[0] & { user: { id: string } },
  phaseId: string | null,
  alive: boolean,
) => {
  const phase = phaseId ? await getPhase(phaseId) : undefined;
  const game = phase ? await getGame(phase.game) : undefined;
  if (!phase || !game) return null;

  const refuse = async (message: string) => {
    await toast.ephemeral(interaction, message, { accent: accent.warning });
    return null;
  };
  if (!isOpen(phase)) return refuse(S.errors.nominationsClosed);

  const rows = await listSeating(game.id);
  const me = await getParticipantByMember(game.id, BigInt(interaction.user.id));
  const mine = me ? rows.find((row) => row.seat.player === me.id) : undefined;
  if (!mine) {
    // An unseated Storyteller acts on a player's behalf; anyone else is turned away.
    const actor = actorOf(interaction as never);
    if (actor && (await isStorytellerOf(game, actor))) return { phase, game, rows, mine: null };
    return refuse(S.errors.nominationRefused['notSeated']!);
  }
  if (alive && mine.seat.state !== 'alive') return refuse(S.errors.nominationRefused['notAlive']!);

  return { phase, game, rows, mine };
};

/**
 * The day's card in the bound thread: every nomination made today with a
 * link to its card and where its count stands, Nominate, and Vote for those
 * who would rather pick the nomination from a list than find its card.
 * Parentless and public; `Ended` takes it down with the game. The
 * `/nominations` commands open the same modals through this card.
 */
export default createView<Empty>()({
  id: 'gnomday',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [NominationEvents.DayChanged], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild], 'proxy-submit': [storytellsDay], manage: [storytellsDay] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const phase = await getPhase(view.entityId!);
    const game = phase ? await getGame(phase.game) : undefined;
    if (!phase || !game) return v2(linear(text('This day is over.')).setAccentColor(accent.neutral));

    const [nominations, rows] = await Promise.all([listNominationsOfPhase(phase.id), listSeating(game.id)]);
    const cards = await listViews({ route: NOMINATION_CARD, entityIds: nominations.map((n) => n.id) });
    const name = await namer(
      client,
      game.guild,
      view.channel,
      rows.map((r) => r.member),
    );
    const bySeat = new Map(rows.map((row) => [row.seat.id, row]));

    const lines = await Promise.all(
      nominations.map(async (n, i) => {
        const ballot = (await listVotes(n.id)).map((v) => v.vote);
        const status = statusOf(ballot, n.required, n.finalizedAt !== null);
        const accuser = bySeat.get(n.plaintiff);
        const nominee = n.defendant ? bySeat.get(n.defendant) : null;
        const words = headline(
          n.kind,
          accuser ? who(accuser, name) : '*an empty seat*',
          nominee ? who(nominee, name) : null,
        );
        const card = cards.find((c) => c.entityId === n.id);
        // A mention inside a masked link does not render, so the link stands beside the words.
        const jump = card ? ` · [card](${link(game.guild, card.channel, card.message)})` : '';
        return `${i + 1}. ${words.slice(0, -1)}${jump} · ${STATUS_MARK[status]} ${tally(ballot)}/${n.required}${n.block ? ' · on the block' : ''}`;
      }),
    );

    const open = isOpen(phase);
    const state = open ? '' : phase.nominationsClosedAt ? 'Closed.\n' : 'Not yet open.\n';

    return {
      ...v2(
        linear(
          text(`### Nominations · ${label(phase)}`),
          text(`${state}${lines.length > 0 ? lines.join('\n') : '*Nobody has been nominated yet.*'}`),
          separator(),
          buttonRow(
            button(view.customId('nominate'), 'Nominate', ButtonStyle.Primary).setDisabled(!open),
            button(view.customId('manage'), 'Manage', ButtonStyle.Secondary),
          ),
        ).setAccentColor(open ? accent.warning : accent.neutral),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...nominateModal.interactions,
    ...proxyNominateModal.interactions,
    // No button of its own: `/nominations vote` shows this modal and its submit lands here.
    ...dayVote.interactions,

    // The Storyteller's pane for the day: the block.
    manage: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const phase = await getPhase(ctx.view.entityId!);
      if (!phase) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView(
        BLOCK_PANE,
        { interaction },
        { visibility: 'ephemeral', ids: { gconfig: phase.game, gnomday: phase.id } },
      );
    },

    // The picker is the modal's own select, so the checks come first and refuse
    // ephemerally; a modal has to be the interaction's first answer.
    nominate: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const found = await standing(interaction, ctx.view.entityId, true);
      if (!found) return;

      // A select with no options cannot be built, so an empty list is a refusal.
      const target = await nomineeChoices(interaction.client, found.game, found.phase.id, found.rows);
      if (target.length === 0) {
        await toast.ephemeral(interaction, S.errors.nobodyToNominate, { accent: accent.warning });
        return;
      }
      if (found.mine) {
        await nominateModal.show(interaction, ctx, { options: { target } });
        return;
      }
      // A Storyteller, unseated: the same form with the accuser picked first.
      const accuser = await accuserChoices(interaction.client, found.game, found.rows);
      if (accuser.length === 0) {
        await toast.ephemeral(interaction, S.errors.nobodyToNominateFor, { accent: accent.warning });
        return;
      }
      await proxyNominateModal.show(interaction, ctx, { options: { accuser, target } });
    },
  },
});
