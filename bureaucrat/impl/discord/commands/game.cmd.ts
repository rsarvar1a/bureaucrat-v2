import { SlashCommandBuilder } from 'discord.js';
import { noop } from '../../../engine/discord/commands/builders/superbuilder';

export default {
  spec: new SlashCommandBuilder().setDescription('Create and run games.'),
  func: noop,
};
