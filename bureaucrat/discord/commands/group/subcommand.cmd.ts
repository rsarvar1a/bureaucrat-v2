import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';

const subcommand = async (interaction: ChatInputCommandInteraction) => {
  interaction.reply('This is a lone subcommand!');
};

export default {
  spec: new SlashCommandSubcommandBuilder().setName('subcommand').setDescription('A subcommand!'),
  func: subcommand,
};
