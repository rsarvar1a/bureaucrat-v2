import { SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { noop } from '../../../../engine/discord/commands/builders/superbuilder';

export default {
  spec: new SlashCommandSubcommandGroupBuilder().setDescription('The archive server ended games are copied into.'),
  func: noop,
};
