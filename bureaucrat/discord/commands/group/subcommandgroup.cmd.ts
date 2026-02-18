import { SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { noop } from '../../commands-framework/builders/superbuilder';

export default {
  spec: new SlashCommandSubcommandGroupBuilder().setDescription('A subcommand group!'),
  func: noop,
};
