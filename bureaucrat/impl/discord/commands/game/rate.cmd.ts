import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameRating } from '../../../../drizzle/game-ratings';
import { getGameByChannel } from '../../../../drizzle/games';
import { actorOf } from '../../access';
import { isStorytellerOf } from '../../guards/game';
import { spawnByRoute } from '../../games/create';
import { draftOf, placeRatingCard, RATING_FORM, raterOf } from '../../games/rating';
import { revealThreads } from '../../games/reveal';
import { S } from '../../../../strings';

/**
 * Two commands in one word, by who runs it. A Storyteller puts the rating
 * card up in the reveal thread (again, if it is already there: it moves to
 * the bottom). A Player or Kibitzer gets the form, which is the card's
 * button from anywhere in the game's channel, card or no card.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Rate this game for its Storytellers, or put the rating card up.')
  .define(async (interaction) => {
    const actor = actorOf(interaction);
    if (actor === null || !interaction.channelId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const refuse = (message: string) => toast.ephemeral(interaction, message, { accent: accent.warning });

    const game = await getGameByChannel(BigInt(interaction.channelId));
    if (!game || game.guild !== BigInt(interaction.guildId!)) {
      await refuse(S.errors.noGameHere);
      return;
    }

    if (await isStorytellerOf(game, actor)) {
      const placed = await placeRatingCard(interaction.client, game);
      if (placed === 'noReveal') await refuse(S.errors.noReveal);
      else if (placed === 'noThread') await refuse(S.errors.ratingThreadGone);
      else {
        const threads = await revealThreads(game.id);
        await toast.ephemeral(interaction, S.rating.placed(threads!.reveal.thread), { accent: accent.success });
      }
      return;
    }

    const rater = await raterOf(game.id, actor.id);
    if (!rater.ok) {
      await refuse(S.errors.notInGame);
      return;
    }
    const state = draftOf(await getGameRating(game.id, actor.id));
    await spawnByRoute(
      RATING_FORM,
      { interaction },
      { entityId: game.id, ids: { gconfig: game.id }, visibility: 'ephemeral', state },
    );
  });
