import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import { actorOf, type Actor } from '../../access';
import { S } from '../../../../strings';

type GameRow = NonNullable<Awaited<ReturnType<typeof getGameByChannel>>>;

/**
 * The game this channel, or this thread's channel, belongs to, with the reply
 * deferred as an ephemeral. A refusal has already been sent when this is null.
 */
export const gameHere = async (
  interaction: ChatInputCommandInteraction,
): Promise<{ game: GameRow; actor: Actor } | null> => {
  const actor = actorOf(interaction);
  if (actor === null || !interaction.channelId) {
    await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
    return null;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const channel = interaction.channel;
  const channelId = channel?.isThread() && channel.parentId ? channel.parentId : interaction.channelId;
  const game = await getGameByChannel(BigInt(channelId));
  if (!game || game.guild !== BigInt(interaction.guildId!)) {
    await toast.ephemeral(interaction, S.errors.noGameHere, { accent: accent.warning });
    return null;
  }

  return { game, actor };
};
