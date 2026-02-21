import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../commands-framework/builders/superbuilder';

export default new Superbuilder(new SlashCommandSubcommandBuilder()).describe('A subcommand!').define(async (interaction) => {
  await interaction.reply('This is a lone subcommand!');
});
