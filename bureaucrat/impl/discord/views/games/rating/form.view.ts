import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import type { ViewContext, ViewInteraction } from '../../../../../engine/discord/views/types';
import { deleteViewMessage, destroyView } from '../../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../../engine/discord/elements';
import { toast, tryDeleteReply } from '../../../../../engine/discord/reply';
import { upsertGameRating } from '../../../../../drizzle/game-ratings';
import { getGame } from '../../../../../drizzle/games';
import { inGuild } from '../../../guards';
import { isComplete, NOTE_OF, QUESTIONS, raterOf, stars, type Aspect, type Draft } from '../../../games/rating';
import { GameEvents } from '../events';
import { prefill, questionModals } from './questions';
import { S } from '../../../../../strings';

const dismiss = dismissButton<Draft>()({ action: 'dismiss' });

const answer = (draft: Draft, key: (typeof QUESTIONS)[number]['key']): string => {
  const mark = draft[key];
  if (mark === undefined) return '*not yet answered*';
  const note = draft[NOTE_OF[key]];
  return `${stars(mark)} ${mark}${note ? `\n> ${note.replace(/\n/g, '\n> ')}` : ''}`;
};

const open = async (key: Aspect, interaction: ViewInteraction, ctx: ViewContext<Draft>) => {
  if (!interaction.isMessageComponent()) return;
  const q = QUESTIONS.find((question) => question.key === key)!;
  await questionModals[key].show(interaction, ctx, prefill(ctx.view.state ?? {}, q));
};

/**
 * The rating form, ephemeral: a button per question opens its modal, the
 * answers show as they come in, and Submit writes the rating once every
 * mark is given. It opens with what the member gave before, so a rating
 * can be revised question by question.
 */
export default createView<Draft>()({
  id: 'gratingform',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text(S.errors.notHere), separator(), dismiss.row(view)).setAccentColor(accent.neutral));
    const draft = view.state ?? {};

    return v2(
      linear(
        text(`### ${S.rating.formTitle(game.name)}\n${S.rating.formHint}`),
        separator(),
        text(QUESTIONS.map((q, i) => `**${i + 1}. ${q.question}**\n${answer(draft, q.key)}`).join('\n\n')),
        separator(),
        buttonRow(
          ...QUESTIONS.map((q, i) =>
            button(
              view.customId(q.key),
              `${i + 1}. ${q.title}`,
              draft[q.key] === undefined ? ButtonStyle.Primary : ButtonStyle.Secondary,
            ),
          ),
        ),
        buttonRow(
          button(view.customId('submit'), S.rating.submit, ButtonStyle.Success).setDisabled(!isComplete(draft)),
          dismiss.button(view),
        ),
      ).setAccentColor(accent.brand),
    );
  },

  interactions: {
    ...dismiss.interactions,
    ...questionModals.script.interactions,
    ...questionModals.decisions.interactions,
    ...questionModals.atmosphere.interactions,
    ...questionModals.overall.interactions,

    // Each question's button opens its modal, filled with what is in the draft.
    script: (interaction, ctx) => open('script', interaction, ctx),
    decisions: (interaction, ctx) => open('decisions', interaction, ctx),
    atmosphere: (interaction, ctx) => open('atmosphere', interaction, ctx),
    overall: (interaction, ctx) => open('overall', interaction, ctx),

    submit: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const draft = ctx.view.state ?? {};
      if (!isComplete(draft)) return { action: 'render' };

      const gameId = ctx.view.entityId!;
      const member = BigInt(interaction.user.id);
      const rater = await raterOf(gameId, member);
      if (!rater.ok) {
        const refusal = rater.reason === 'storyteller' ? S.errors.storytellersDoNotRate : S.errors.notInGame;
        await toast.followUp(interaction, refusal, { accent: accent.warning });
        return { action: 'render' };
      }

      await upsertGameRating({
        game: gameId,
        member,
        role: rater.role,
        script: draft.script,
        scriptNote: draft.scriptNote ?? null,
        decisions: draft.decisions,
        decisionsNote: draft.decisionsNote ?? null,
        atmosphere: draft.atmosphere,
        atmosphereNote: draft.atmosphereNote ?? null,
        overall: draft.overall,
        comment: draft.comment ?? null,
      });

      await destroyView(ctx.view.id);
      await ctx.notify(GameEvents.Changed);
      await toast.followUp(interaction, S.rating.thanks, { accent: accent.success, timeoutMs: 10_000 });
      await tryDeleteReply(interaction);
      return { action: 'noop' };
    },
  },
});
