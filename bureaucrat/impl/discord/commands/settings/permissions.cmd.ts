import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnView } from '../../../../engine/discord/views/lifecycle';
import { viewDefinitions } from '../../registry/views';
import { seedDefaultRoles } from '../../../acl/seed';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Manage access control roles and permissions.')
  .define(async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command must be used in a server.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await seedDefaultRoles(BigInt(guildId), { member: BigInt(interaction.user.id) });

    const viewDef = viewDefinitions.get('aclroles')!;

    await spawnView(
      viewDef,
      { interaction },
      {
        entityId: guildId,
        visibility: 'ephemeral',
      },
    );
  });
