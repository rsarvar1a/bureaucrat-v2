import { ChannelType, MessageFlags, SlashCommandBooleanOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { actorOf } from '../../../access';
import { gameOfChannel } from '../../../games/offsite/adopt';
import { destinationForCategories } from '../../../games/offsite/mappings';
import { placeOffsiteCard, startExport } from '../../../games/offsite/start';
import { destinationOf } from '../../../games/offsite/write';
import { S } from '../../../../../strings';

const REFUSALS = { running: S.errors.exportRunning, done: S.errors.exportDone, nothing: S.errors.nothingExported };

/**
 * Copies the channel this is run in into the off-server archive its
 * on-server archive is mapped to, whether or not
 * the record knows it: a channel from before the record is adopted first
 * (`offsite/adopt.ts`) so the same export engine carries it over. Gated on
 * `server.manage` at the gate.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Copy this channel into the archive server, even one the bot did not run.')
  .withOption(new Option('fresh', SlashCommandBooleanOption).describe('Throw away an earlier copy and start over'))
  .define(async (interaction, params) => {
    const actor = actorOf(interaction);
    if (actor === null || !interaction.guildId || !interaction.channel) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const refuse = (message: string) => toast.ephemeral(interaction, message, { accent: accent.warning });

    const guildId = BigInt(interaction.guildId);
    const here = interaction.channel;
    const channel = here.isThread() ? here.parent : here;
    if (!channel || channel.isDMBased() || channel.type !== ChannelType.GuildText)
      return refuse(S.errors.copyNotAChannel);

    // The channel's archive says where it goes; checked now, so a missing
    // permission is seen before an hour of work rather than after.
    const row = await destinationForCategories(channel.guild, [channel.parentId]);
    if (!row) return refuse(S.errors.notMapped);
    const destination = await destinationOf(interaction.client, row);
    if (!destination.ok) {
      return refuse(
        destination.reason === 'noOffsite' ? S.errors.noOffsite : S.errors.offsiteNotReachable(destination.missing),
      );
    }

    const found = await gameOfChannel(channel, guildId, actor.id);
    if (found.game === null) return refuse(found.reason === 'elsewhere' ? S.errors.noGameHere : S.errors.gameNotEnded);
    const { game, adopted } = found;

    const result = await startExport(game, { copy: true, fresh: params.fresh ?? false, destination: row.id });
    if (!result.ok) {
      await toast.ephemeral(interaction, REFUSALS[result.reason], { accent: accent.neutral });
      return;
    }
    await placeOffsiteCard(interaction.client, game);
    await toast.ephemeral(interaction, adopted ? S.offsite.adopted(game.name) : S.offsite.started(game.name), {
      accent: accent.success,
      timeoutMs: 10_000,
    });
  });
