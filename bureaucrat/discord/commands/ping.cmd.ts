import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

const ping = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply('Pong!');
};

export default {
  spec: new SlashCommandBuilder().setName('ping').setDescription('Pongs!'),
  func: ping,
};
