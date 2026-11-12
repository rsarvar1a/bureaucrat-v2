import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnByRoute } from '../../games/create';

// A Manager's, by living under `admin` (`commandAccess`).
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe("Set who the bot's Managers, Moderators, Storytellers and Players are.")
  .define(async (interaction) => {
    await spawnByRoute('adminconfig', { interaction }, { entityId: interaction.guildId!, visibility: 'ephemeral' });
  });
