import { ChannelType, MessageFlags, SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { updateGuildSettings } from '../../../../../drizzle/guild-settings';
import { destinationOf } from '../../../games/offsite/write';
import { S } from '../../../../../strings';

/**
 * Names the archive server and the category there that `/game offsite`
 * copies into. Ids rather than a channel select, since a select cannot
 * reach another server. Gated on `server.manage` at the gate. The bot's
 * permissions there are checked at once, so a gap shows now.
 *
 * The category is the seed of a chain: when it fills, the bot renames it
 * `… 1`, makes `… 2` above it and moves this setting along (`archives/`).
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Set the server and category that ended games are copied into.')
  .withOption(new Option('guild', SlashCommandStringOption, true).describe('The archive server, by id'))
  .withOption(
    new Option('category', SlashCommandStringOption, true).describe(
      'The category there, by id; the seed of a chain the bot extends',
    ),
  )
  .define(async (interaction, params) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (!/^\d+$/.test(params.guild) || !/^\d+$/.test(params.category)) {
      await toast.ephemeral(interaction, S.errors.offsiteNotReachable([]), { accent: accent.warning });
      return;
    }
    const guild = await interaction.client.guilds.fetch(params.guild).catch(() => null);
    const category = guild ? await guild.channels.fetch(params.category).catch(() => null) : null;
    if (!guild || !category || category.type !== ChannelType.GuildCategory) {
      await toast.ephemeral(interaction, S.errors.offsiteNotReachable([]), { accent: accent.warning });
      return;
    }

    await updateGuildSettings(BigInt(interaction.guildId), {
      offsiteGuild: BigInt(guild.id),
      offsiteCategory: BigInt(category.id),
    });

    const check = await destinationOf(interaction.client, BigInt(interaction.guildId));
    const note = check.ok ? '' : `\n${S.errors.offsiteNotReachable(check.ok ? [] : check.missing)}`;
    await toast.ephemeral(interaction, `${S.offsite.offsiteSet(guild.name, category.name)}${note}`, {
      accent: check.ok ? accent.success : accent.warning,
      timeoutMs: 15_000,
    });
  });
