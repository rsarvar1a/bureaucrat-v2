import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';

const deepcommand = async (interaction: ChatInputCommandInteraction) => {
  interaction.reply('This is a deep subcommand!');
};

export default {
  spec: new SlashCommandSubcommandBuilder().setName('deepcommand').setDescription('A deep subcommand!'),
  func: deepcommand,
};
