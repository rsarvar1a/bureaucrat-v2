import { SlashCommandBuilder } from 'discord.js';
import { Superbuilder } from '../commands-framework/builders/superbuilder';

export default new Superbuilder(new SlashCommandBuilder()).describe('Throws an error!').define(async () => {
  throw new Error("Don't run this command.");
});
