import { SlashCommandBuilder } from 'discord.js';
import { noop } from '../frameworks/commands/builders/superbuilder';

export default {
  spec: new SlashCommandBuilder().setDescription('A command group!'),
  func: noop,
};
