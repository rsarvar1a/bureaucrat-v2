import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { commandHandlers } from '../../commands';
import { logger } from '../../../utilities/logger';

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
    logger.error({ message: `No command handler found for path ${path}.` });
    await interaction.reply({
      content: 'An error occurred while processing this command.',
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  try {
    await func(interaction);
  } catch (error) {
    logger.error({ message: `Encountered error in command ${path}.`, error });
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'An error occurred while executing this command.',
        flags: [MessageFlags.Ephemeral],
      });
    } else {
      await interaction.reply({
        content: 'An error occurred while executing this command.',
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
}
