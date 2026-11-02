import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import type { Game } from '../../../../schema/core/games.sql';
import { actorOf } from '../../access';
import { isStorytellerOf } from '../../guards/game';
import { S } from '../../../../strings';

type GameRow = typeof Game.$inferSelect;

/**
 * The game a reminders command acts on, found by its channel, with the caller
 * a Storyteller of it and the game not over. Replies (ephemerally) on every
 * refusal, so a caller that gets a game back has a deferred reply to fill.
 */
export const reminderContext = async (interaction: ChatInputCommandInteraction): Promise<GameRow | null> => {
  const actor = actorOf(interaction);
  if (actor === null || !interaction.channelId) {
    await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
    return null;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const game = await getGameByChannel(BigInt(interaction.channelId));
  if (!game || game.guild !== BigInt(interaction.guildId!)) {
    await toast.ephemeral(interaction, S.errors.noGameHere, { accent: accent.warning });
    return null;
  }

  if (game.state === 'completed') {
    await toast.ephemeral(interaction, S.errors.gameAlreadyEnded, { accent: accent.neutral });
    return null;
  }

  if (!(await isStorytellerOf(game, actor))) {
    await toast.ephemeral(interaction, S.errors.notGameStoryteller, { accent: accent.warning });
    return null;
  }

  return game;
};
