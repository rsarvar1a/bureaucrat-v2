import { MessageFlags, SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel, updateGame } from '../../../../drizzle/games';
import { logger } from '../../../../utilities/logger';
import { actorOf } from '../../access';
import { isStorytellerOf } from '../../guards/game';
import { endedChannelName } from '../../games/names';
import { S } from '../../../../strings';

/**
 * Gives an ended game the name its players settled on, in the record and on
 * the channel, which keeps the date it ended in front. Open at the gate and
 * decided here: a Storyteller of the game, found by the channel.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Rename this ended game, in the record and on its channel.')
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

    if (game.state !== 'completed') {
      await toast.ephemeral(interaction, S.errors.renameBeforeEnd, { accent: accent.warning });
      return;
    }

    if (!(await isStorytellerOf(game, actor))) {
      await toast.ephemeral(interaction, S.errors.notGameStoryteller, { accent: accent.warning });
      return;
    }

    const name = params['name'].trim().slice(0, 100);
    await updateGame(game.id, { name });

    try {
      const channel = await interaction.client.channels.fetch(String(game.channel));
      if (channel && 'setName' in channel) {
        await channel.setName(endedChannelName(name, game.endedAt ?? new Date()), 'Game renamed');
      }
    } catch (error) {
      logger.warn({ message: `Could not rename channel ${game.channel} of game ${game.id}.`, error });
      await toast.ephemeral(interaction, S.errors.gameNotRenamed, { accent: accent.warning });
      return;
    }

    await toast.ephemeral(interaction, `**${game.name}** is now **${name}**.`, {
      accent: accent.success,
      timeoutMs: 10_000,
    });
  });
