import { ChannelType, MessageFlags, SlashCommandBooleanOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { getGameByChannel, insertGame } from '../../../../../drizzle/games';
import { actorOf } from '../../../access';
import { parseDateStamp, titleFromChannelName } from '../../../games/names';
import { placeOffsiteCard, startExport } from '../../../games/offsite/start';
import { destinationOf } from '../../../games/offsite/write';
import { S } from '../../../../../strings';

const REFUSALS = { running: S.errors.exportRunning, done: S.errors.exportDone, nothing: S.errors.nothingExported };

/**
 * Copies the channel this is run in into the archive server, whether or not
 * the record knows it. A channel from before the record (an older bot's
 * game) is adopted first: a bare ended game named after the channel, dated
 * by the stamp in its name or else by when the channel was made, so the
 * same export engine carries it over. Gated on `server.manage` at the gate.
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

    let game = await getGameByChannel(BigInt(channel.id));
    if (game && game.guild !== guildId) return refuse(S.errors.noGameHere);
    if (game && game.state !== 'completed') return refuse(S.errors.gameNotEnded);

    // Checked now, so a missing permission is seen before an hour of work rather than after.
    const destination = await destinationOf(interaction.client, guildId);
    if (!destination.ok) {
      return refuse(
        destination.reason === 'noOffsite' ? S.errors.noOffsite : S.errors.offsiteNotReachable(destination.missing),
      );
    }

    const adopted = !game;
    game ??= await insertGame({
      guild: guildId,
      channel: BigInt(channel.id),
      creator: actor.id,
      name: titleFromChannelName(channel.name),
      state: 'completed',
      endedAt: parseDateStamp(channel.name) ?? channel.createdAt,
    });

    const result = await startExport(game, { copy: true, fresh: params.fresh ?? false });
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
