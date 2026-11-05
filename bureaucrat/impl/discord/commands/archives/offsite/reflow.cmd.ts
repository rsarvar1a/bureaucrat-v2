import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { getDestination, listSources, updateDestination } from '../../../../../drizzle/offsite';
import { reflowChain } from '../../../games/archives/categories';
import { stampByName } from '../../../games/archives/stamps';
import { destinationOf } from '../../../games/offsite/write';
import { S } from '../../../../../strings';

/**
 * Puts every channel across each off-server archive this server maps to in
 * date order, by the stamp each channel's name carries, making categories
 * as it needs. Gated on `server.manage` at the gate.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Reorder every copied game across the off-server archives, newest first.')
  .define(async (interaction) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const ids = [...new Set((await listSources(BigInt(interaction.guildId))).map((source) => source.destination))];
    if (ids.length === 0) {
      await toast.ephemeral(interaction, S.errors.noOffsite, { accent: accent.warning, timeoutMs: 15_000 });
      return;
    }

    const done: { base: string; channels: number; links: number }[] = [];
    const problems: string[] = [];
    for (const id of ids) {
      const row = await getDestination(id);
      const destination = await destinationOf(interaction.client, row);
      if (!row || !destination.ok) {
        problems.push(
          destination.ok || destination.reason === 'noOffsite'
            ? S.errors.archiveGone
            : S.errors.offsiteNotReachable(destination.missing),
        );
        continue;
      }
      const reflow = await reflowChain(destination.guild, BigInt(destination.category.id), stampByName);
      if (!reflow) {
        problems.push(S.errors.archiveGone);
        continue;
      }
      await updateDestination(row.id, { category: BigInt(reflow.current.id) });
      done.push({
        base: `${destination.guild.name} › ${reflow.chain.base}`,
        channels: reflow.channels,
        links: reflow.chain.links.length,
      });
    }

    await toast.ephemeral(interaction, [S.offsite.reflowed(done), ...problems].filter(Boolean).join('\n'), {
      accent: problems.length > 0 ? accent.warning : accent.success,
      timeoutMs: 15_000,
    });
  });
