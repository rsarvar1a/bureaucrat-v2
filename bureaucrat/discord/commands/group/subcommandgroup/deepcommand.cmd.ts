import { ChatInputCommandInteraction, SlashCommandBooleanOption, SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../commands-framework/builders/superbuilder';
import type { InferParams } from '../../../commands-framework/builders/types';

const spec = new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('A deep subcommand!')
  .withOption(new Option('name', SlashCommandStringOption, true).describe('Enter your name'))
  .withOption(new Option('enthusiasm', SlashCommandBooleanOption).describe('Make the command enthusiastic'));

const deepcommand = async (interaction: ChatInputCommandInteraction, { enthusiasm, name }: InferParams<typeof spec>) => {
  const punctuation = enthusiasm ? '!!!' : '...';
  await interaction.reply(`Hey ${name}, this is a deep subcommand${punctuation}`);
};

export default spec.define(deepcommand);
