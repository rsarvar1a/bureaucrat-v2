import { SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { noop } from '../../commands';

export default {
  spec: new SlashCommandSubcommandGroupBuilder().setName('subcommandgroup').setDescription('A subcommand group!'),
  func: noop,
};
