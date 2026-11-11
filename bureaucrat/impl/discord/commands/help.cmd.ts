import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../engine/discord/commands/builders/superbuilder';
import { S } from '../../../strings';

export default new Superbuilder(new SlashCommandBuilder())
  .describe('Where to find the Bureaucrat documentation.')
  .define(async (interaction) => {
    await interaction.reply({ content: S.help.docs, flags: [MessageFlags.Ephemeral, MessageFlags.SuppressEmbeds] });
  });
