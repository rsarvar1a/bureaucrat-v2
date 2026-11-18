import { listOpenWhispersOf } from '../../../../drizzle/whispers';
import { restricts } from './rules';

/** Whether a player is in a synchronous whisper they have not ended: silenced in town, and unable to open another. */
export const busyWhispering = async (gameId: string, participantId: string): Promise<boolean> => {
  const open = await listOpenWhispersOf(gameId, participantId);
  return open.some((w) => {
    const mine = w.members.find((m) => m.participant.id === participantId);
    return mine ? restricts(w.whisper, mine.part) : false;
  });
};
