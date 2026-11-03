import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { text, separator, linear, buttonRow, linkButton, v2 } from '../../../../engine/discord/elements';
import { listQueuesByGuild } from '../../../../drizzle/queues';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('List all queues in this server.')
  .define(async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command must be used in a server.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const queues = await listQueuesByGuild(BigInt(guildId));

    if (queues.length === 0) {
      await interaction.editReply({ content: 'No queues found in this server.' });
      return;
    }

    const children = queues.flatMap((q, i) => {
      const card = [
        text(`### ${q.name}`),
        ...(q.description ? [text(q.description)] : []),
        ...(q.channel && q.message
          ? [buttonRow(linkButton('Go to Queue', `https://discord.com/channels/${guildId}/${q.channel}/${q.message}`))]
          : []),
      ];
      return i > 0 ? [separator(), ...card] : card;
    });

    await interaction.editReply(v2(linear(...children)));
  });
