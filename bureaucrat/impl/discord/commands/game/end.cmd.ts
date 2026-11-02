import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import { actorOf } from '../../access';
import { isStorytellerOf } from '../../guards/game';
import { spawnByRoute } from '../../games/create';
import { S } from '../../../../strings';

/**
 * Ends the game this channel belongs to, through the pane this opens (`gend`):
 * the winning team, then the players on it, then End.
 *
 * Open at the command gate and decided here: the path cannot know which game,
 * and "a Storyteller of this game" is the rule, not a permission. Run it from
 * the game's channel or any of its threads.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('End the game this channel belongs to.')
  .define(async (interaction) => {
    const actor = actorOf(interaction);
    if (actor === null || !interaction.channelId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const game = await getGameByChannel(BigInt(interaction.channelId));
    if (!game || game.guild !== BigInt(interaction.guildId!)) {
      await toast.ephemeral(interaction, S.errors.noGameHere, { accent: accent.warning });
      return;
    }

    if (game.state === 'completed') {
      await toast.ephemeral(interaction, S.errors.gameAlreadyEnded, { accent: accent.neutral });
      return;
    }

    if (!(await isStorytellerOf(game, actor))) {
      await toast.ephemeral(interaction, S.errors.notGameStoryteller, { accent: accent.warning });
      return;
    }

    await spawnByRoute(
      'gend',
      { interaction },
      { entityId: game.id, ids: { gconfig: game.id }, visibility: 'ephemeral', state: { winner: null, selected: [] } },
    );
  });
