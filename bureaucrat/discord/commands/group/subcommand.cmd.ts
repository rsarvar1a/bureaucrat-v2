import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../frameworks/commands/builders/superbuilder';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('A subcommand!')
  .define(async (interaction) => {
    await interaction.reply('This is a lone subcommand!');
  });
