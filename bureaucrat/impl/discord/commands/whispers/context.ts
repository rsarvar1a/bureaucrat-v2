import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import { getManagedThreadBySnowflake } from '../../../../drizzle/managed-threads';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { getOpenWhisperOfThread, type WhisperRow } from '../../../../drizzle/whispers';
import type { Game } from '../../../../schema/core/games.sql';
import type { Participant } from '../../../../schema/core/people.sql';
import { actorOf } from '../../access';
import { S } from '../../../../strings';

type GameRow = typeof Game.$inferSelect;
type ParticipantRow = typeof Participant.$inferSelect;

/**
 * What every `/whispers` command needs first: the game this channel (or
 * thread) belongs to and the caller's part in it. Replies for itself when
 * something is missing, so a command that gets `null` is done.
 */
export const whisperContext = async (
  interaction: ChatInputCommandInteraction,
): Promise<{ game: GameRow; me: ParticipantRow } | null> => {
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

  const me = await getParticipantByMember(game.id, actor.id);
  if (!me) {
    await toast.ephemeral(interaction, S.errors.notInGame, { accent: accent.warning });
    return null;
  }

  return { game, me };
};

/** The open whisper of the thread a command was run in, or null when it was run anywhere else. */
export const whisperHere = async (interaction: ChatInputCommandInteraction): Promise<WhisperRow | null> => {
  const row = interaction.channelId ? await getManagedThreadBySnowflake(BigInt(interaction.channelId)) : undefined;
  if (!row || row.kind !== 'whisper') return null;
  return (await getOpenWhisperOfThread(row.id)) ?? null;
};
