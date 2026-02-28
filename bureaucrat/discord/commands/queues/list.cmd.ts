import { ButtonBuilder, ButtonStyle, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../frameworks/commands/builders/superbuilder';
import { text, separator, linear, buttonRow, v2 } from '../../elements';
import { listQueuesByGuild } from '../../../drizzle/queues';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('List all queues in this server.')
  .define(async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

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
          ? [
              buttonRow(
                new ButtonBuilder()
                  .setLabel('Go to Queue')
                  .setStyle(ButtonStyle.Link)
                  .setURL(`https://discord.com/channels/${guildId}/${q.channel}/${q.message}`),
              ),
            ]
          : []),
      ];
      return i > 0 ? [separator(), ...card] : card;
    });

    await interaction.editReply(v2(linear(...children)));
  });
