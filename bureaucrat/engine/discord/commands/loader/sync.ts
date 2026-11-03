import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { logger } from '../../../../utilities/logger';

/**
 * Where this process publishes its commands.
 *
 * `DISCORD_GUILD_ID` narrows the registration to one guild, which propagates
 * instantly and is what you want while iterating. Unset means global, which is
 * the only scope that reaches every guild the bot is in - and therefore the
 * production answer once it is in more than one.
 *
 * It matters that every caller agrees. A guild-scoped set published on top of a
 * global one does not replace it: Discord shows both, and every command appears
 * twice in the picker.
 */
export const commandScope = (): string | undefined => process.env.DISCORD_GUILD_ID?.trim() || undefined;

/**
 * Push a command forest up to Discord.
 *
 * When `guildId` is a string, commands are synced to that specific guild.
 * When `guildId` is `true`, the `DISCORD_GUILD_ID` env var is used.
 * When omitted, commands are synced globally.
 */
export const syncCommands = async (commands: SlashCommandBuilder[], guildId?: string | true) => {
  const resolvedGuild = typeof guildId === 'string' ? guildId : guildId ? process.env.DISCORD_GUILD_ID : undefined;

  if (guildId === true && !resolvedGuild) {
    logger.info({ message: 'DISCORD_GUILD_ID is not set; publishing commands globally.' });
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = resolvedGuild
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, resolvedGuild)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
  await rest.put(route, { body: commands });
};

/**
 * Deletes all commands in the selected scope.
 *
 * Nothing calls this on the happy path - publishing replaces a scope wholesale.
 * It is here for the one case that cannot: narrowing to `DISCORD_GUILD_ID` and
 * later unsetting it leaves the old guild holding a registration no boot knows
 * about any more, and this is what clears it.
 */
export const deleteCommands = async (develop?: true) => syncCommands([], develop);
