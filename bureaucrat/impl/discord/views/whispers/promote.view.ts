import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import type { HandlerResult, ViewContext, ViewGuard, ViewInteraction } from '../../../../engine/discord/views/types';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGame } from '../../../../drizzle/games';
import { getWhisper, listWhisperMembers } from '../../../../drizzle/whispers';
import { inGuild } from '../../guards';
import { answerPromotion } from '../../games/whispers/close';
import { GameEvents } from '../games/events';
import { namer } from '../naming';
import { whisperOf } from './common';
import { WhisperEvents } from './events';
import { S } from '../../../../strings';

/** Who asked, and how it ended once it has: the card keeps its own verdict so a later request cannot repaint it. */
type PromoteCardState = { asker: string; outcome: null | 'promoted' | { declined: string } };

const member: ViewGuard = async (interaction, ctx) => {
  const found = await whisperOf(interaction, ctx.view.entityId);
  return found?.mine ? true : S.errors.whisperNotYours;
};

/**
 * The promotion request: one member of a synchronous whisper asks the rest
 * to make it asynchronous. Accept and Decline for everyone else; the last yes
 * flips the whisper and lifts the silence, any no keeps it as it was.
 */
export default createView<PromoteCardState>()({
  id: 'gwhisperpromote',
  idParams: [],
  events: {},
  defaultState: { asker: '', outcome: null },
  subscribesTo: { render: [WhisperEvents.PromoteChanged], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild], accept: [member], decline: [member] },

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
    const list = (ids: string[]) => ids.map(called).join(', ');
    const asker = view.state?.asker ?? '';
    const others = members.filter((m) => m.participant.id !== asker).map((m) => m.participant.id);
    const everyone = list(members.map((m) => m.participant.id));

    const outcome = view.state?.outcome ?? null;
    if (outcome === 'promoted' || whisper.async) {
      return v2(linear(text(`${everyone}'s whisper is now async.`)).setAccentColor(accent.success));
    }
    if (outcome !== null) {
      return v2(linear(text(`${called(outcome.declined)} kept the whisper sync.`)).setAccentColor(accent.neutral));
    }
    if (whisper.state !== 'accepted' || !whisper.promoting) {
      return v2(
        linear(
          text(`${called(asker)} asked to make the whisper with ${list(others)} async, but it closed first.`),
        ).setAccentColor(accent.neutral),
      );
    }

    const waiting = members.filter((m) => m.part.promote === null).map((m) => m.participant.id);
    return v2(
      linear(
        text(`${called(asker)} asks to make the whisper with ${list(others)} async.`),
        ...(others.length > 1 ? [text(`-# Waiting on ${list(waiting)}.`)] : []),
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
  },
});

const answer = async (
  interaction: ViewInteraction,
  ctx: ViewContext<PromoteCardState>,
  yes: boolean,
): Promise<HandlerResult> => {
  if (!interaction.isMessageComponent()) return;
  await interaction.deferUpdate();

  const found = await whisperOf(interaction, ctx.view.entityId);
  const game = found ? await getGame(found.whisper.game) : undefined;
  if (!found?.me || !game) return { action: 'render' };

  const result = await answerPromotion(interaction.client, game, found.whisper.id, found.me, yes);
  if (!result.ok) {
    await toast.followUp(interaction, S.errors.whisperPromoteAnswer[result.reason], { accent: accent.warning });
    return { action: 'render' };
  }

  if (result.outcome === 'promoted') await ctx.updateState({ outcome: 'promoted' });
  if (result.outcome === 'declined') await ctx.updateState({ outcome: { declined: found.me.id } });
  return { action: 'render' };
};
