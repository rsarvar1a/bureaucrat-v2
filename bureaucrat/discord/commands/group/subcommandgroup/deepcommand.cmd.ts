import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';

const deepcommand = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply('This is a deep subcommand!');
};

export default {
  spec: new SlashCommandSubcommandBuilder().setDescription('A deep subcommand!'),
  func: deepcommand,
};
