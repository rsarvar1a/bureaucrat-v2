import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import type { Game } from '../../../../schema/core/games.sql';
import { Permissions } from '../../../acl/permissions';
import { accessAllows, actorOf, type Actor } from '../../access';
import { S } from '../../../../strings';

type GameRow = typeof Game.$inferSelect;

/**
 * An ended game this channel belongs to, for the owner or a server
 * manager: the rule `/game archive` set, shared by the archive commands
 * that followed it. Refuses ephemerally; the reply is deferred.
 */
export const endedGameContext = async (
  interaction: ChatInputCommandInteraction,
): Promise<{ game: GameRow; actor: Actor } | null> => {
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
  if (game.state !== 'completed') return refuse(S.errors.gameNotEnded);

  const owner = game.creator === actor.id;
  const manager = owner ? true : (await accessAllows(game.guild, actor, Permissions.Server.Manage)).ok;
  if (!owner && !manager) return refuse(S.errors.notGameArchiver);

  return { game, actor };
};
