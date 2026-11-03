import type { Client } from 'discord.js';
import { listOpenWhispersOf } from '../../../../drizzle/whispers';
import type { Game } from '../../../../schema/core/games.sql';
import type { Participant } from '../../../../schema/core/people.sql';
import { logger } from '../../../../utilities/logger';
import { restricts } from './rules';

type GameRow = typeof Game.$inferSelect;
type ParticipantRow = typeof Participant.$inferSelect;

/** Whether a player is in a synchronous whisper they have not ended: silenced in town, and unable to open another. */
export const busyWhispering = async (gameId: string, participantId: string): Promise<boolean> => {
  const open = await listOpenWhispersOf(gameId, participantId);
  return open.some((w) => {
    const mine = w.members.find((m) => m.participant.id === participantId);
    return mine ? restricts(w.whisper, mine.part) : false;
  });
};

/**
 * The one writer of a player's town overwrite. In an open synchronous
 * whisper a player may speak in threads (the whisper, their ST thread) and
 * not in the game channel; out of every such whisper the overwrite goes.
 * Needs Manage Roles on the channel, as the Kibitzers' sight does; a refusal
 * is logged and the whisper carries on without the silence.
 */
export const syncTownVoice = async (client: Client, game: GameRow, participant: ParticipantRow): Promise<void> => {
  if (game.channel === 0n) return;

  const silenced = await busyWhispering(game.id, participant.id);

  try {
    const channel = await client.channels.fetch(String(game.channel));
    if (!channel || channel.isDMBased() || channel.isThread()) return;
    const member = String(participant.member);
    if (silenced) {
      await channel.permissionOverwrites.edit(
        member,
        { SendMessages: false, SendMessagesInThreads: true },
        { reason: `Game: ${game.name} - whispering` },
      );
    } else if (channel.permissionOverwrites.cache.has(member)) {
      await channel.permissionOverwrites.delete(member, `Game: ${game.name} - whisper ended`);
    }
  } catch (error) {
    logger.warn({ message: `Could not update the town voice of ${participant.member} in game ${game.id}.`, error });
  }
};
