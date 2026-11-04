import { getGameByChannel } from '../../../../drizzle/games';
import { parseDateStamp } from '../names';
import type { StampOf } from './categories';

/** When an archived channel is from: the stamp in its name, else when it was made. */
export const stampByName: StampOf = async (channel) => parseDateStamp(channel.name) ?? channel.createdAt ?? new Date(0);

/** The same, but a channel the record knows is filed under the day its game ended. */
export const stampByRecord: StampOf = async (channel) => {
  const game = await getGameByChannel(BigInt(channel.id));
  return game?.endedAt ?? stampByName(channel);
};
