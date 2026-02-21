import { SlashCommandBuilder } from 'discord.js';
import { noop } from '../commands-framework/builders/superbuilder';

export default {
  spec: new SlashCommandBuilder().setDescription('A command group!'),
  func: noop,
};
