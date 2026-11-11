import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import type { HandlerResult, ViewContext, ViewGuard, ViewInteraction } from '../../../../engine/discord/views/types';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  linkButton,
  v2,
} from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGame } from '../../../../drizzle/games';
import { getOrCreateGameSettings } from '../../../../drizzle/game-settings';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { getManagedThread } from '../../../../drizzle/managed-threads';
import { getWhisper, listWhisperMembers } from '../../../../drizzle/whispers';
import { inGuild } from '../../guards';
import { answerInvitation, standings, threadUrl, type Standing } from '../../games/whispers/propose';
import { GameEvents } from '../games/events';
import { namer } from '../naming';
import { displayNames } from '../queue/members';
import { whisperOf } from './common';
import { WhisperEvents } from './events';
import { memberLines } from './format';
import { S } from '../../../../strings';

/** What the card remembers once the whisper opens: everyone's count at that moment. */
type WhisperCardState = { standings: Standing[] | null };

/** Only the people asked may answer, and the one asking is not asked. */
const invited: ViewGuard = async (interaction, ctx) => {
  const found = await whisperOf(interaction, ctx.view.entityId);
  if (!found?.mine) return S.errors.whisperNotInvited;
  return found.whisper.initiator === found.mine.participant.id ? S.errors.whisperNotInvited : true;
};

/** The people in the whisper may go to it, and so may the Kibitzers and Storytellers who watch it. */
const inWhisper: ViewGuard = async (interaction, ctx) => {
  const found = await whisperOf(interaction, ctx.view.entityId);
  if (found?.mine) return true;
  const whisper = found?.whisper ?? (await getWhisper(ctx.view.entityId!));
  const me = whisper ? await getParticipantByMember(whisper.game, BigInt(interaction.user.id)) : undefined;
  return me && me.role !== 'Player' ? true : S.errors.whisperNotYours;
};

/**
 * The invitation card, where Configuration > Whispers binds: who asks whom, Accept and Decline
 * for the invitees, then, once everyone has said yes, who is whispering and
 * where each of them stands, as it was at that moment, with Go for the thread.
 * As each of them ends their part the card says so, and once the whisper has
 * closed it says they whispered.
 */
export default createView<WhisperCardState>()({
  id: 'gwhisper',
  idParams: [],
  events: {},
  defaultState: { standings: null },
  subscribesTo: { render: [WhisperEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild], accept: [invited], decline: [invited], go: [inWhisper] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const whisper = await getWhisper(view.entityId!);
    const game = whisper ? await getGame(whisper.game) : undefined;
    if (!whisper || !game) return v2(linear(text(S.errors.notHere)).setAccentColor(accent.danger));

    const members = await listWhisperMembers(whisper.id);
    const name = await namer(
      client,
      game.guild,
      view.channel,
      members.map((m) => m.participant.member),
    );
    const called = (participantId: string) => {
      const m = members.find((x) => x.participant.id === participantId);
      return m ? name(m.participant.member) : '?';
    };
    const initiator = called(whisper.initiator);
    const invitees = members.filter((m) => m.participant.id !== whisper.initiator);
    const list = (ids: string[]) => ids.map(called).join(', ');
    const tag = whisper.async ? ' *(async)*' : '';

    if (whisper.state === 'declined') {
      const who = invitees.filter((m) => m.part.accepted === false).map((m) => m.participant.id);
      return v2(linear(text(`${list(who)} declined ${initiator}'s whisper.${tag}`)).setAccentColor(accent.neutral));
    }

    if (whisper.state === 'ended' && !whisper.thread) {
      return v2(
        linear(
          text(`${initiator}'s invitation to ${list(invitees.map((m) => m.participant.id))} lapsed.${tag}`),
        ).setAccentColor(accent.neutral),
      );
    }

    if (whisper.state === 'accepted' || whisper.state === 'ended') {
      const closed = whisper.state === 'ended';
      const { preciseWhisperTracking: precise } = await getOrCreateGameSettings(game.id);
      const line = (m: (typeof members)[number]) =>
        memberLines(
          called(m.participant.id),
          view.state?.standings?.find((x) => x.participant === m.participant.id),
          m.part.endedAt,
          { closed, precise },
        );
      return v2(
        linear(
          text(`${list(members.map((m) => m.participant.id))} ${closed ? 'whispered' : 'are whispering'}.${tag}`),
          text(members.map(line).join('\n')),
          separator(),
          buttonRow(button(view.customId('go'), 'Go', ButtonStyle.Primary)),
        ).setAccentColor(closed ? accent.neutral : accent.success),
      );
    }

    const waiting = invitees.filter((m) => m.part.accepted === null).map((m) => m.participant.id);
    return v2(
      linear(
        text(`${initiator} is inviting ${list(invitees.map((m) => m.participant.id))} to a whisper.${tag}`),
        ...(invitees.length > 1 ? [text(`-# Waiting on ${list(waiting)}.`)] : []),
        separator(),
        buttonRow(
          button(view.customId('accept'), 'Accept', ButtonStyle.Success),
          button(view.customId('decline'), 'Decline', ButtonStyle.Danger),
        ),
      ),
    );
  },

  interactions: {
    accept: async (interaction, ctx) => answer(interaction, ctx, true),
    decline: async (interaction, ctx) => answer(interaction, ctx, false),

    go: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const whisper = await getWhisper(ctx.view.entityId!);
      const game = whisper ? await getGame(whisper.game) : undefined;
      const thread = whisper?.thread ? await getManagedThread(whisper.thread) : undefined;
      if (!whisper || !game || !thread) {
        await toast.ephemeral(interaction, S.errors.notHere, { accent: accent.warning });
        return;
      }
      await interaction.reply({
        ...v2(
          linear(
            text(`Your whisper is in <#${thread.thread}>.`),
            buttonRow(linkButton('Open thread', threadUrl(game.guild, thread.thread))),
          ),
        ),
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      });
    },
  },
});

const answer = async (
  interaction: ViewInteraction,
  ctx: ViewContext<WhisperCardState>,
  accepted: boolean,
): Promise<HandlerResult> => {
  if (!interaction.isMessageComponent()) return;
  await interaction.deferUpdate();

  const found = await whisperOf(interaction, ctx.view.entityId);
  const game = found ? await getGame(found.whisper.game) : undefined;
  if (!found?.me || !game) return { action: 'render' };

  const result = await answerInvitation(interaction.client, game, found.whisper.id, found.me, accepted);
  if (!result.ok) {
    const message =
      result.reason === 'other-in-whisper'
        ? S.errors.whisperAnswerBusy(
            (await displayNames(interaction.client, game.guild, [result.who.member]))[String(result.who.member)] ??
              String(result.who.member),
          )
        : S.errors.whisperAnswer[result.reason];
    await toast.followUp(interaction, message, { accent: accent.warning });
    return { action: 'render' };
  }

  if (result.outcome === 'opened') {
    const members = await listWhisperMembers(result.whisper.id);
    await ctx.updateState({ standings: await standings(game, result.whisper, members) });
  }

  return { action: 'render' };
};
