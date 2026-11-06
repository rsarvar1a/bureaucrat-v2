import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { getSeatedPlayer } from '../../../../drizzle/seating';
import { listVotes } from '../../../../drizzle/votes';
import { inGuild } from '../../guards';
import { storytellsNomination } from '../../guards/nominations';
import { ballotLines, headline, quoted, statusLine } from '../../games/nominations/format';
import { CONSOLE, votingLive } from '../../games/nominations/open';
import { mayVote, statusOf, tally } from '../../games/nominations/rules';
import { GameEvents } from '../games/events';
import { roleLook, stateTag, who } from '../games/seating/render';
import { namer } from '../naming';
import { NominationEvents } from './events';
import { ballotPeek } from './peek';
import {
  accusationModal,
  accuserVote,
  cardVote,
  defenseModal,
  loadNomination as load,
  nomineeVote,
  seatOf,
  selfText,
  selfVote,
  type Empty,
} from './modals';
import { S } from '../../../../strings';

type CardState = Empty;

/**
 * One nomination's card in the bound thread: who calls for whose execution,
 * where the count stands, the accusation and the defense, and the ballot in
 * voting order with the next hand to lock flagged. Players vote from here;
 * the Storyteller locks from the console it opens.
 */
export default createView<CardState>()({
  id: 'gnomination',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [NominationEvents.Changed], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild], manage: [storytellsNomination] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const found = await load(view.entityId);
    if (!found) return v2(linear(text(S.errors.nominationGone)).setAccentColor(accent.neutral));
    const { nomination, game, phase } = found;

    const [ballot, accuser, nominee] = await Promise.all([
      listVotes(nomination.id),
      getSeatedPlayer(nomination.plaintiff),
      nomination.defendant ? getSeatedPlayer(nomination.defendant) : null,
    ]);
    const name = await namer(client, game.guild, view.channel, [
      accuser?.member,
      nominee?.member,
      ...ballot.map((v) => v.member),
    ]);
    const look = roleLook(client, game.guild, null);

    const votes = ballot.map((v) => v.vote);
    const status = statusOf(votes, nomination.required, nomination.finalizedAt !== null);
    const live = status === 'open' && (await votingLive(game, phase));

    return {
      ...v2(
        linear(
          text(
            headline(
              nomination.kind,
              accuser ? who(accuser, name) : '*an empty seat*',
              nominee ? who(nominee, name) : null,
            ),
          ),
          text(statusLine(status, tally(votes), nomination.required, nomination.block)),
          separator(),
          text(`**Accusation**\n${quoted(nomination.accusation, '*none given*')}`),
          separator(),
          text(`**Defense**\n${quoted(nomination.defense, '*none yet*')}`),
          separator(),
          text(
            ballotLines(
              ballot.map((v) => ({
                position: v.vote.position,
                locked: v.vote.locked,
                yes: v.vote.yes,
                weight: v.vote.weight,
                public: v.vote.public,
                name: who(v, name),
                state: stateTag(v.vote.state, look.emote),
              })),
              nomination.required,
            ).join('\n') || '*Nobody is seated to vote.*',
          ),
          separator(),
          buttonRow(
            button(view.customId('vote'), 'Vote', ButtonStyle.Primary).setDisabled(!live),
            button(view.customId('manage'), 'Manage', ButtonStyle.Secondary),
          ),
        ).setAccentColor(status === 'passed' ? accent.danger : status === 'failed' ? accent.neutral : accent.warning),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...cardVote.interactions,
    ...accuserVote.interactions,
    ...nomineeVote.interactions,
    ...selfVote.interactions,
    // No buttons of their own: `/nominations accuse` and `defend` show these and their submits land here.
    ...defenseModal.interactions,
    ...accusationModal.interactions,

    // One Vote for everyone; the accuser's form carries the accusation while
    // no hand is locked, the nominee's their defense, a self-nominator's both.
    // When the vote itself is refused (locked, spent) the accuser and the
    // nominee still get their text boxes, under a title saying why; once the day
    // is left, nobody writes anything. A Kibitzer has no hand to raise and sees the whole ballot instead, private votes and all.
    vote: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const found = await load(ctx.view.entityId);
      if (!found) return;

      const me = await getParticipantByMember(found.game.id, BigInt(interaction.user.id));
      if (me?.role === 'Kibitzer') {
        const payload = await ballotPeek(interaction.client, found.game, found.nomination, interaction.channelId);
        await interaction.reply({ ...payload, flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
        return;
      }

      const mine = await seatOf(interaction, found.nomination);
      if (!mine) {
        await toast.ephemeral(interaction, S.errors.notVoting, { accent: accent.warning });
        return;
      }
      if (!(await votingLive(found.game, found.phase))) {
        await toast.ephemeral(interaction, S.errors.votingClosed, { accent: accent.warning });
        return;
      }
      const refusal = mine.vote.locked
        ? { message: S.errors.voteLocked, why: 'vote locked' }
        : !mayVote(found.nomination.kind, mine.vote.state)
          ? { message: S.errors.noGhostVote, why: 'no vote left' }
          : null;

      const { nomination } = found;
      const values = {
        public: mine.vote.public ?? '',
        private: mine.vote.private ?? '',
        accusation: nomination.accusation ?? '',
        defense: nomination.defense ?? '',
      };
      const anyLocked = (await listVotes(nomination.id)).some((v) => v.vote.locked);
      const accuses = mine.seat.id === nomination.plaintiff && !anyLocked;
      const defends = mine.seat.id === nomination.defendant;

      if (!refusal) {
        const form = accuses && defends ? selfVote : accuses ? accuserVote : defends ? nomineeVote : cardVote;
        await form.show(interaction, ctx, { values });
        return;
      }
      if (!accuses && !defends) {
        await toast.ephemeral(interaction, refusal.message, { accent: accent.warning });
        return;
      }
      const form = accuses && defends ? selfText : accuses ? accusationModal : defenseModal;
      const title = accuses && defends ? 'Accusation and defense' : accuses ? 'Your accusation' : 'Your defense';
      await form.show(interaction, ctx as never, { values, title: `${title} · ${refusal.why}` });
    },

    manage: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const found = await load(ctx.view.entityId);
      if (!found) return;

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView(
        CONSOLE,
        { interaction },
        {
          visibility: 'ephemeral',
          state: { mode: 'yes', weight: 1, seats: [] },
          ids: { gconfig: found.game.id, gnomday: found.phase.id, gnomination: found.nomination.id },
        },
      );
    },
  },
});
