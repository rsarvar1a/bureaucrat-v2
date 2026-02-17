import type { ChatInputCommandInteraction } from 'discord.js';
import { commandHandlers } from '../../commands';

const resolve = (interaction: ChatInputCommandInteraction): string => {
  const cmd = interaction.commandName;
  const subcmd = interaction.options.getSubcommand(false);
  const subcmdgroup = interaction.options.getSubcommandGroup(false);
  return [cmd, subcmdgroup, subcmd].filter(Boolean).join('::');
};

export default async function onChatInputCommand(interaction: ChatInputCommandInteraction) {
  const path = resolve(interaction);
  const func = commandHandlers.get(path);

  if (!func) {
    console.error(`No command handler found for path: ${path}`);
    await interaction.reply({
      content: 'An error occurred while processing this command.',
      ephemeral: true,
    });
    return;
  }

  try {
    await func(interaction);
  } catch (e) {
    console.error(`Error executing command at path ${path}:`, e);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'An error occurred while executing this command.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'An error occurred while executing this command.',
        ephemeral: true,
      });
    }
  }
}
