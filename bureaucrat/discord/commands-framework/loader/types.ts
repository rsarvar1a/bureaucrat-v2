import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
} from 'discord.js';

export type Spec = SlashCommandBuilder | SlashCommandSubcommandGroupBuilder | SlashCommandSubcommandBuilder;

export type CommandDefinition = {
  spec: Spec;
  func: (interaction: ChatInputCommandInteraction) => void | Promise<void>;
};

export type CommandProvidingModule = { default: CommandDefinition };

export type ResolvedCommandDefinition = CommandDefinition & { path: string };
