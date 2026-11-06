import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { currentPhase } from '../../../../drizzle/game-phases';
import { getGameByChannel } from '../../../../drizzle/games';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { listSeating, type SeatedPlayer } from '../../../../drizzle/seating';
import type { Game, GamePhase } from '../../../../schema/core/games.sql';
import { actorOf } from '../../access';
import { isStorytellerOf } from '../../guards/game';
import { DAY_CARD, NOMINATION_CARD } from '../../games/nominations/open';
import { listViews, type StoredView } from '../../../../engine/discord/views/query';
import { S } from '../../../../strings';

type GameRow = typeof Game.$inferSelect;
type PhaseRow = typeof GamePhase.$inferSelect;

export type NominationContext = {
  game: GameRow;
  /** The current day, its nominations opened; they may since have closed to new ones. */
  phase: PhaseRow;
  /** Every seat, empty ones included. */
  rows: SeatedPlayer[];
  /** The caller's seat, or null for an unseated Storyteller acting on a player's behalf. */
  me: SeatedPlayer | null;
};

/**
 * What every `/nominations` command needs: the game this channel belongs to,
 * its current day once nominations have opened, and the caller's seat in it.
 * Refuses ephemerally, so a caller that gets a context back has a reply to
 * fill (deferred unless it asked not to).
 */
export const nominationContext = async (
  interaction: ChatInputCommandInteraction,
  // A command about to show a modal must not defer: the modal is the first answer.
  options: { defer?: boolean } = {},
): Promise<NominationContext | null> => {
  const actor = actorOf(interaction);
  if (actor === null || !interaction.channelId) {
    await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
    return null;
  }

  if (options.defer !== false) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const refuse = async (message: string) => {
    await toast.ephemeral(interaction, message, { accent: accent.warning });
    return null;
  };

  const game = await getGameByChannel(BigInt(interaction.channelId));
  if (!game || game.guild !== BigInt(interaction.guildId!)) return refuse(S.errors.noGameHere);
  if (game.state !== 'running') return refuse(S.errors.nominationsClosed);

  const phase = await currentPhase(game.id);
  if (!phase || phase.phase !== 'day' || phase.nominationsOpenedAt === null) return refuse(S.errors.nominationsClosed);

  const rows = await listSeating(game.id);
  const participant = await getParticipantByMember(game.id, actor.id);
  const me = participant ? rows.find((row) => row.seat.player === participant.id) : undefined;
  if (!me && !(await isStorytellerOf(game, actor))) return refuse(S.errors.nominationRefused['notSeated']!);

  return { game, phase, rows, me: me ?? null };
};

/** The day card the commands stand in for; without it nominations are not open. */
export const dayCardOf = async (phaseId: string): Promise<StoredView | null> => {
  const [row] = await listViews({ route: DAY_CARD, entityId: phaseId });
  return row ?? null;
};

/** The card of a nomination, for a command standing in for one of its buttons. */
export const cardOf = async (nominationId: string): Promise<StoredView | null> => {
  const [row] = await listViews({ route: NOMINATION_CARD, entityId: nominationId });
  return row ?? null;
};
