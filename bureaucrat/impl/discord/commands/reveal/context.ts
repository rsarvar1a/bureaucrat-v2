import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import type { Game } from '../../../../schema/core/games.sql';
import { actorOf, type Actor } from '../../access';
import { isStorytellerOf } from '../../guards/game';
import { S } from '../../../../strings';

type GameRow = typeof Game.$inferSelect;

export type RevealContext = { game: GameRow; actor: Actor };

/** Why `/reveal read` or `/reveal react` let nobody in. */
export const refusals = {
  noReveal: S.errors.noReveal,
  unpublished: S.errors.revealNotPublished,
  refused: S.errors.notAdmitted,
} as const;

/**
 * The game this channel (or thread) belongs to and who is asking; refuses
 * ephemerally. The write-up is the Storytellers' to make, name and publish;
 * reading and reacting are open to anyone who can see the channel, since an
 * ended game's channel is the archive, once the reveal is published.
 */
export const revealContext = async (
  interaction: ChatInputCommandInteraction,
  options: { storyteller: boolean },
): Promise<RevealContext | null> => {
  const actor = actorOf(interaction);
  if (actor === null || !interaction.channelId) {
    await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
    return null;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const refuse = async (message: string) => {
    await toast.ephemeral(interaction, message, { accent: accent.warning });
    return null;
  };

  const game = await getGameByChannel(BigInt(interaction.channelId));
  if (!game || game.guild !== BigInt(interaction.guildId!)) return refuse(S.errors.noGameHere);
  if (options.storyteller && !(await isStorytellerOf(game, actor))) return refuse(S.errors.notGameStoryteller);

  return { game, actor };
};
