import { SlashCommandBuilder } from 'discord.js';
import { noop } from '../../../engine/discord/commands/builders/superbuilder';

export default {
  spec: new SlashCommandBuilder().setDescription('Join a game, leave it, or see who is in it.'),
  func: noop,
};
