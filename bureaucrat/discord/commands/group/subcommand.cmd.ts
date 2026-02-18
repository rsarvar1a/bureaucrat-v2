import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';

const subcommand = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply('This is a lone subcommand!');
};

export default {
  spec: new SlashCommandSubcommandBuilder().setDescription('A subcommand!'),
  func: subcommand,
};
