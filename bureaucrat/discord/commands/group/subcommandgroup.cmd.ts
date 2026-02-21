import { SlashCommandSubcommandGroupBuilder } from 'discord.js';

export default {
  spec: new SlashCommandSubcommandGroupBuilder().setDescription('A subcommand group!'),
  func: async () => {},
};
