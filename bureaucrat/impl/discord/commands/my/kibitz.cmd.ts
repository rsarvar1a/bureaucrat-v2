import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnByRoute } from '../../games/create';
import type { MyGamesState } from '../../views/my/games.view';
import { S } from '../../../../strings';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('The games you kibitz.')
  .define(async (interaction) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const state: MyGamesState = {
      kind: 'kibitz',
      grouping: 'state',
      filter: 'all',
      sort: 'created',
      descending: true,
      page: 0,
    };
    await spawnByRoute('mygames', { interaction }, { entityId: interaction.guildId, visibility: 'ephemeral', state });
  });
