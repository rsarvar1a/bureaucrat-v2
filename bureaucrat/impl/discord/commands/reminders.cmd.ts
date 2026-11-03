import { SlashCommandBuilder } from 'discord.js';
import { noop } from '../../../engine/discord/commands/builders/superbuilder';

export default {
  spec: new SlashCommandBuilder().setDescription('Timed messages in a game.'),
  func: noop,
};
