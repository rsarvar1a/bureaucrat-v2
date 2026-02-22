import { SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { noop } from '../../frameworks/commands/builders/superbuilder';

export default {
  spec: new SlashCommandSubcommandGroupBuilder().setDescription('A subcommand group!'),
  func: noop,
};
