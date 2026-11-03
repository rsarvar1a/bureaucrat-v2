import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { text, separator, linear, v2 } from '../../../../engine/discord/elements';
import { listEntriesByStorytellerInGuild, listQueueEntries } from '../../../../drizzle/queue-entries';
import { listSignups } from '../../../../drizzle/queue-entry-signups';
import { modeLabel } from '../../views/queue/signup-mode';
import { S } from '../../../../strings';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('List the queue entries you are storytelling.')
  .define(async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const mine = await listEntriesByStorytellerInGuild(BigInt(interaction.user.id), BigInt(guildId));

    if (mine.length === 0) {
      await interaction.editReply({ content: 'You have no entries in any queue in this server.' });
      return;
    }

    // Position is the entry's rank among its queue, which the row alone cannot say.
    const queues = new Map<string, Awaited<ReturnType<typeof listQueueEntries>>>();
    for (const { entry } of mine) {
      if (!queues.has(entry.queue)) queues.set(entry.queue, await listQueueEntries(entry.queue));
    }

    const cards = await Promise.all(
      mine.map(async ({ entry, queueName }) => {
        const order = queues.get(entry.queue)!;
        const rank = order.findIndex((e) => e.id === entry.id) + 1;
        const signups = await listSignups(entry.id);
        const accepted = signups.filter((s) => s.accepted === true).length;
        const pending = signups.filter((s) => s.accepted === null).length;

        const lines = [
          `**Queue:** ${queueName} · **Position:** ${rank} of ${order.length}`,
          `**Signups:** ${modeLabel(entry.signups)} · ${accepted} accepted, ${pending} pending`,
        ];
        if (entry.minimumStartDate) {
          lines.push(`**Earliest start:** <t:${Math.floor(entry.minimumStartDate.getTime() / 1000)}:D>`);
        }

        return [text(`### ${entry.title}`), text(lines.join('\n'))];
      }),
    );

    await interaction.editReply(v2(linear(...cards.flatMap((card, i) => (i > 0 ? [separator(), ...card] : card)))));
  });
