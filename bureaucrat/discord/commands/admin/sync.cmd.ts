import { SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../frameworks/commands/builders/superbuilder';
import { commands } from '../../commands';
import { syncCommands } from '../../frameworks/commands/loader/sync';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Sync slash commands to a guild.')
  .withOption(new Option('guild', SlashCommandStringOption).describe('Guild ID (defaults to current guild)'))
  .define(async (interaction, params) => {
    const guildId = params.guild ?? interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'No guild ID available. Use this in a server or provide a guild ID.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await syncCommands(commands, guildId);
      await interaction.editReply(`Synced ${commands.length} command(s) to guild \`${guildId}\`.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await interaction.editReply(`Failed to sync commands: ${message}`);
    }
  });
