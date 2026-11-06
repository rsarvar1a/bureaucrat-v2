import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnByRoute } from '../../games/create';
import { S } from '../../../../strings';

/** The server's stats settings. Gated on `server.manage` at the gate. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe("Set how this server's stats are worked out.")
  .define(async (interaction) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    await spawnByRoute('statsconfig', { interaction }, { entityId: interaction.guildId, visibility: 'ephemeral' });
  });
