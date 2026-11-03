import type { ViewInteraction } from '../../../../engine/discord/views/types';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { getWhisper, listWhisperMembers } from '../../../../drizzle/whispers';
import { actorOf } from '../../access';

/** The whisper a card is about, and the caller's part in it, if any. */
export const whisperOf = async (interaction: ViewInteraction, whisperId: string | null) => {
  const actor = actorOf(interaction);
  const whisper = actor && whisperId ? await getWhisper(whisperId) : undefined;
  if (!actor || !whisper) return null;
  const me = await getParticipantByMember(whisper.game, actor.id);
  const members = await listWhisperMembers(whisper.id);
  const mine = me ? members.find((m) => m.participant.id === me.id) : undefined;
  return { whisper, me, mine, members };
};
