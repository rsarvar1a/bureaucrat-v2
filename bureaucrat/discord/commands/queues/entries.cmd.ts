import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../frameworks/commands/builders/superbuilder';
import { text, separator, linear, v2 } from '../../elements';
import { listSignupsByMemberInGuild } from '../../../drizzle/queue-entry-signups';

const signupStatus = (accepted: boolean | null) =>
  accepted === true ? 'Accepted' : accepted === false ? 'Declined' : 'Pending';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('List your signups across all queues in this server.')
  .define(async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const signups = await listSignupsByMemberInGuild(BigInt(interaction.user.id), BigInt(guildId));

    if (signups.length === 0) {
      await interaction.editReply({ content: 'You have no signups in this server.' });
      return;
    }

    const children = signups.flatMap((s, i) => {
      const card = [
        text(`### ${s.entryTitle}`),
        text(
          `**Queue:** ${s.queueName}\n**Role:** ${s.role}\n**Status:** ${signupStatus(s.accepted)}${s.message ? `\n**Message:** ${s.message}` : ''}`,
        ),
      ];
      return i > 0 ? [separator(), ...card] : card;
    });

    await interaction.editReply(v2(linear(...children)));
  });
