import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnByRoute } from '../../games/create';
import { S } from '../../../../strings';

/** Every player's record, sorted and paged per viewer. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Every player in this server, with games played and win rates.')
  .define(async (interaction) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    await spawnByRoute('statsranking', { interaction }, { entityId: interaction.guildId, visibility: 'ephemeral' });
  });
