import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnView } from '../../../../engine/discord/views/lifecycle';
import { viewDefinitions } from '../../registry/views';
import { S } from '../../../../strings';

/** The server's default archive category, in an ephemeral pane. Gated on `server.manage` at the gate. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe("Set the server's default archive category for ended games.")
  .define(async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }

    await spawnView(viewDefinitions.get('archives')!, { interaction }, { entityId: guildId, visibility: 'ephemeral' });
  });
