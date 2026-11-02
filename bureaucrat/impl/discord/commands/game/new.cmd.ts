import { MessageFlags, SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent, buttonRow, linear, linkButton, text, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { logger } from '../../../../utilities/logger';
import { createGame } from '../../games/create';
import { S } from '../../../../strings';

// The back door: a game outside any queue, in the category of the channel the
// command is run from, with the invoker as its only Storyteller. Sits behind
// `game.create` because the queue is the sanctioned path.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Create a game outside the queue, in this category.')
  .withOption(new Option('name', SlashCommandStringOption, true).describe('What the game is called'))
  .define(async (interaction, params) => {
    const guild = interaction.guildId;
    const channel = interaction.channel;
    if (!guild || !channel) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const category = channel.isThread() ? channel.parent?.parentId : 'parentId' in channel ? channel.parentId : null;

    try {
      const created = await createGame(
        { interaction },
        {
          guild: BigInt(guild),
          creator: BigInt(interaction.user.id),
          name: params.name,
          category: category ? BigInt(category) : null,
          storytellers: [],
          kibitzers: [],
          players: [],
        },
      );

      await interaction.editReply(
        v2(
          linear(
            text(`Created **${params.name}**. Your Storyteller threads are ready in ${created.channel}.`),
            buttonRow(linkButton('Open GAME CONFIG', created.threads.config.url)),
          ).setAccentColor(accent.success),
        ),
      );
    } catch (error) {
      logger.error({ message: `Could not create game "${params.name}" in guild ${guild}.`, error });
      await toast.ephemeral(interaction, S.errors.gameNotCreated, { accent: accent.danger });
    }
  });
