import { updateGameSettings } from '../../../drizzle/game-settings';
import { listParticipants } from '../../../drizzle/participants';
import { getScriptSummary } from '../../../drizzle/scripts';
import { liveSeatMemory, liveSeatPatch, type LiveMap, type LiveSeat } from './clocktower-live';
import { byTeam, parseScript } from './script/parse';
import { applyLiveSeats } from './seats';

/**
 * A matched grimoire written onto the game: each seat matched to someone
 * still a Player gets its life state and role, and the matching is kept so
 * the next upload with the same seat names needs no matching at all.
 */
export const applyLiveState = async (gameId: string, seats: LiveSeat[], map: LiveMap): Promise<number> => {
  const [script, players] = await Promise.all([getScriptSummary(gameId), listParticipants(gameId, 'Player')]);
  const parsed = script?.json ? parseScript(script.json) : null;
  const characters = parsed?.ok ? byTeam(parsed.script.characters) : null;
  const known = new Set(players.map((p) => p.id));

  const entries = seats.flatMap((seat, index) => {
    const participant = map[String(index)];
    return participant && known.has(participant) ? [{ participant, patch: liveSeatPatch(seat, characters) }] : [];
  });

  await updateGameSettings(gameId, { liveSeatMap: liveSeatMemory(seats, map) });
  return entries.length === 0 ? 0 : applyLiveSeats(gameId, entries);
};
