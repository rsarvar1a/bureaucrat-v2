import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { updateGuildSettings } from '../../../../../drizzle/guild-settings';
import { reflowChain } from '../../../games/archives/categories';
import { stampByName } from '../../../games/archives/stamps';
import { destinationOf } from '../../../games/offsite/write';
import { S } from '../../../../../strings';

/**
 * Puts every channel across the archive server's chain in date order, by
 * the stamp each channel's name carries, making categories as it needs.
 * Gated on `server.manage` at the gate.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Reorder every copied game across the archive server, newest first.')
  .define(async (interaction) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const guildId = BigInt(interaction.guildId);
    const destination = await destinationOf(interaction.client, guildId);
    if (!destination.ok) {
      const message =
        destination.reason === 'noOffsite' ? S.errors.noOffsite : S.errors.offsiteNotReachable(destination.missing);
      await toast.ephemeral(interaction, message, { accent: accent.warning, timeoutMs: 15_000 });
      return;
    }

    const done = await reflowChain(destination.guild, BigInt(destination.category.id), stampByName);
    if (!done) {
      await toast.ephemeral(interaction, S.errors.archiveGone, { accent: accent.warning });
      return;
    }
    await updateGuildSettings(guildId, { offsiteCategory: BigInt(done.current.id) });

    await toast.ephemeral(
      interaction,
      S.offsite.reflowed([{ base: done.chain.base, channels: done.channels, links: done.chain.links.length }]),
      {
        accent: accent.success,
        timeoutMs: 15_000,
      },
    );
  });
