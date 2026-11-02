import { SlashCommandBuilder } from 'discord.js';
import { noop } from '../../../engine/discord/commands/builders/superbuilder';

export default {
  spec: new SlashCommandBuilder().setDescription("The Storytellers' write-up of the game, and the reactions to it."),
  func: noop,
};
