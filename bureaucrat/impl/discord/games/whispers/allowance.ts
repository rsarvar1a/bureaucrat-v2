import { getOrCreateGameSettings } from '../../../../drizzle/game-settings';
import { listSeating } from '../../../../drizzle/seating';
import type { GameSettings } from '../../../../schema/core/games.sql';
import { budget, type Budget } from './rules';

type SettingsRow = typeof GameSettings.$inferSelect;

/**
 * How many play at the table, travelers aside: the seated players once there
 * are any, else the count the signups plan for, else none (which the table
 * reads as its smallest).
 */
export const tablePlayers = async (gameId: string, settings: SettingsRow): Promise<number> => {
  const seated = (await listSeating(gameId)).filter((row) => row.member !== null && !row.seat.traveler).length;
  return seated > 0 ? seated : (settings.playerCount ?? 0);
};

/** The day's allowance for a game, its settings read here unless the caller has them. */
export const allowanceOf = async (gameId: string, settings?: SettingsRow): Promise<Budget> => {
  const row = settings ?? (await getOrCreateGameSettings(gameId));
  return budget(row, await tablePlayers(gameId, row));
};
