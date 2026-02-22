import { SlashCommandBuilder } from 'discord.js';
import { Superbuilder } from '../frameworks/commands/builders/superbuilder';

export default new Superbuilder(new SlashCommandBuilder()).describe('Pongs!').define(async (interaction) => {
  await interaction.reply('Pong!');
});
