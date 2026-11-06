import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnByRoute } from '../../games/create';
import { S } from '../../../../strings';

/** Message counts by game and by user. The first in a server can take seconds, so it defers first. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('How much each game and each user in this server has said.')
  .define(async (interaction) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    await spawnByRoute('statsmessages', { interaction }, { entityId: interaction.guildId, visibility: 'ephemeral' });
  });
