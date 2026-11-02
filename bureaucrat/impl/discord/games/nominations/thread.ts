import type { Client } from 'discord.js';
import type { Game } from '../../../../schema/core/games.sql';
import { boundChannel, type BoundChannel } from '../bound-thread';

type GameRow = typeof Game.$inferSelect;

export type NominationChannel = BoundChannel;

/** Where nominations happen: the thread Configuration > Nominations binds, or the game channel. */
export const nominationChannel = (client: Client, game: GameRow): Promise<NominationChannel | null> =>
  boundChannel(client, game, 'nominationThread');
