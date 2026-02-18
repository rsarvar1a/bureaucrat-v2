import { SlashCommandBuilder } from 'discord.js';
import { Superbuilder } from '../commands-framework/builders/superbuilder';

export default new Superbuilder(new SlashCommandBuilder()).describe('Pongs!').define(async (interaction) => {
  await interaction.reply('Pong!');
});
