import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../../engine/discord/elements';
import { getGameRating, listGameRatings } from '../../../../../drizzle/game-ratings';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { draftOf, RATING_FORM, RATINGS_PANE, raterOf } from '../../../games/rating';
import { GameEvents } from '../events';
import { S } from '../../../../../strings';

type Empty = Record<string, never>;

/**
 * The public card in the reveal thread, from `/game rate`: a line and a
 * button. Anyone in the thread may press it; the Players and Kibitzers get
 * the form, the Storytellers a word. A Storyteller's second button opens
 * the ratings given so far, ephemerally.
 */
export default createView<Empty>()({
  id: 'grating',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [GameEvents.Changed] },
  guards: { '*': [inGuild], ratings: [storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const count = (await listGameRatings(view.entityId!)).length;
    return {
      ...v2(
        linear(
          text(`### ${S.rating.prompt}\n${S.rating.soFar(count)}`),
          separator(),
          buttonRow(
            button(view.customId('rate'), S.rating.submit, ButtonStyle.Primary),
            button(view.customId('ratings'), S.rating.seeRatings, ButtonStyle.Secondary),
          ),
        ).setAccentColor(accent.brand),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    rate: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const member = BigInt(interaction.user.id);
      const rater = await raterOf(ctx.view.entityId!, member);
      if (!rater.ok) {
        const refusal = rater.reason === 'storyteller' ? S.errors.storytellersDoNotRate : S.errors.notInGame;
        await interaction.reply({ content: refusal, flags: [MessageFlags.Ephemeral] });
        return;
      }
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const state = draftOf(await getGameRating(ctx.view.entityId!, member));
      await ctx.spawnView(RATING_FORM, { interaction }, { visibility: 'ephemeral', state });
    },

    ratings: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView(RATINGS_PANE, { interaction }, { visibility: 'ephemeral' });
    },
  },
});
