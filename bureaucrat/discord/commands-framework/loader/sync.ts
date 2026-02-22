import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { logger } from '../../../utilities/logger';

/**
 * Push a command forest up to Discord.
 */
export const syncCommands = async (commands: SlashCommandBuilder[], develop?: true) => {
  if (develop && !process.env.DISCORD_GUILD_ID) {
    logger.warn({
      message: 'Tried to sync commands to development guild, but DISCORD_GUILD_ID is not set; falling back to global.',
    });
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route =
    develop && process.env.DISCORD_GUILD_ID
      ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
      : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
  await rest.put(route, { body: commands });
};

/**
 * Deletes all commands in the selected scope.
 */
export const deleteCommands = async (develop?: true) => syncCommands([], develop);
