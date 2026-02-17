import { SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { noop } from '../../commands';

export default {
  spec: new SlashCommandSubcommandGroupBuilder().setDescription('A subcommand group!'),
  func: noop,
};
