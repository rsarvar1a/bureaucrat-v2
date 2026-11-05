import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../../engine/discord/commands/builders/superbuilder';
import { spawnView } from '../../../../../engine/discord/views/lifecycle';
import { viewDefinitions } from '../../../registry/views';
import { S } from '../../../../../strings';

/** Which on-server archives are copied into which off-server ones, in an ephemeral pane. Gated on `server.manage` at the gate. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Map this server’s archives to the off-server archives their games are copied into.')
  .define(async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await spawnView(viewDefinitions.get('aoffsite')!, { interaction }, { entityId: guildId, visibility: 'ephemeral' });
  });
