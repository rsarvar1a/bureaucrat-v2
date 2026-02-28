import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { logger } from '../../../../utilities/logger';

/**
 * Push a command forest up to Discord.
 *
 * When `guildId` is a string, commands are synced to that specific guild.
 * When `guildId` is `true`, the `DISCORD_GUILD_ID` env var is used.
 * When omitted, commands are synced globally.
 */
export const syncCommands = async (commands: SlashCommandBuilder[], guildId?: string | true) => {
  const resolvedGuild = typeof guildId === 'string' ? guildId : guildId ? process.env.DISCORD_GUILD_ID : undefined;

  if (guildId && !resolvedGuild) {
    logger.warn({
      message: 'Tried to sync commands to development guild, but DISCORD_GUILD_ID is not set; falling back to global.',
    });
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = resolvedGuild
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, resolvedGuild)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
  await rest.put(route, { body: commands });
};

/**
 * Deletes all commands in the selected scope.
 */
export const deleteCommands = async (develop?: true) => syncCommands([], develop);
