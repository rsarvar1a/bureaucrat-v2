import type { Client } from 'discord.js';
import type { SpawnTarget } from '../../../../engine/discord/views/lifecycle';
import type { WhisperRow } from '../../../../drizzle/whispers';
import { boundChannel } from '../bound-thread';
import { spawnByRoute } from '../create';
import { checkProposal, openWhisper, recordProposal, type Proposal, type Refusal } from './propose';

export const WHISPER_CARD = 'gwhisper';

export type Posted =
  | { ok: true; kind: 'invited'; whisper: WhisperRow; channel: string }
  | { ok: true; kind: 'opened'; whisper: WhisperRow }
  | { ok: false; reason: Refusal };

/**
 * A proposal made good: a free whisper opens its thread and says nothing in
 * town; any other posts an invitation card where Configuration > Whispers
 * binds (the game channel when nowhere) for the invitees to answer.
 */
export const proposeWhisper = async (client: Client, target: SpawnTarget, proposal: Proposal): Promise<Posted> => {
  const check = await checkProposal(proposal);
  if (!check.ok) return check;

  const whisper = await recordProposal(proposal, check.cost, check.day);
  if (proposal.free) return { ok: true, kind: 'opened', whisper: await openWhisper(client, proposal.game, whisper) };

  const where = await boundChannel(client, proposal.game, 'whisperThread');
  if (!where) return { ok: false, reason: 'not-running' };

  // Parentless, and told which game it belongs to so the game's end takes it
  // down with everything else.
  await spawnByRoute(
    WHISPER_CARD,
    { ...target, channel: where.channel },
    { entityId: whisper.id, ids: { gconfig: proposal.game.id }, state: { standings: null } },
  );

  return { ok: true, kind: 'invited', whisper, channel: where.channel.id };
};
