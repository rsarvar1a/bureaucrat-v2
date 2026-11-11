import {
  MessageFlags,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  time,
  TimestampStyles,
} from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { notifyContexts } from '../../../../engine/discord/views/notify';
import { getGameByChannel } from '../../../../drizzle/games';
import { actorOf } from '../../access';
import { isStorytellerOf } from '../../guards/game';
import { renameGame } from '../../games/rename';
import { gameEvents } from '../../views/games/events';
import { viewDefinitions } from '../../registry/views';
import { S } from '../../../../strings';

/**
 * Renames the game this channel belongs to, in the record and on its channel,
 * at any point in its life. Open at the gate and decided here: a Storyteller
 * of the game, found by the channel or any of its threads.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Rename this game and its channel.')
  .withOption(new Option('name', SlashCommandStringOption, true).describe('What the game is called now'))
  .define(async (interaction, params) => {
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

    if (!(await isStorytellerOf(game, actor))) {
      await toast.ephemeral(interaction, S.errors.notGameStoryteller, { accent: accent.warning });
      return;
    }

    const name = params['name'].trim().slice(0, 100);
    const result = await renameGame(interaction.client, game, name);
    if (!result.ok) {
      const message =
        result.reason === 'limited'
          ? S.errors.gameRenameLimited(time(result.retryAt, TimestampStyles.RelativeTime))
          : S.errors.gameNotRenamed;
      await toast.ephemeral(interaction, message, { accent: accent.warning });
      return;
    }

    // The windows that show the name; an ended game has none left.
    if (game.state !== 'completed') {
      await notifyContexts(interaction.client, viewDefinitions, [gameEvents(game.id).Changed]);
    }

    await toast.ephemeral(interaction, S.games.renamed(game.name, name), { accent: accent.success, timeoutMs: 10_000 });
  });
