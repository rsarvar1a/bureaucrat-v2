import { MessageFlags, SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { syncCommands } from '../../../../engine/discord/commands/loader/sync';

// Lazy, and not by choice: the registry awaits loading every command file,
// this one included, so a static import here is a cycle through a top-level
// await that deadlocks startup.
const registry = () => import('../../registry/commands');

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Sync slash commands to a guild.')
  .withOption(new Option('guild', SlashCommandStringOption).describe('Guild ID (defaults to current guild)'))
  .define(async (interaction, params) => {
    const guildId = params.guild ?? interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'No guild ID available. Use this in a server or provide a guild ID.',
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const { commands } = await registry();
      await syncCommands(commands, guildId);
      await interaction.editReply(`Synced ${commands.length} command(s) to guild \`${guildId}\`.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await interaction.editReply(`Failed to sync commands: ${message}`);
    }
  });
