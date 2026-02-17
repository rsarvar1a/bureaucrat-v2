import { SlashCommandBuilder } from 'discord.js';
import { noop } from '../commands';

export default {
  spec: new SlashCommandBuilder().setDescription('A command group!'),
  func: noop,
};
