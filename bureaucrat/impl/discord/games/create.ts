import type { TextBasedChannel } from 'discord.js';
import { clientOf, spawnView, type SpawnTarget } from '../../../engine/discord/views/lifecycle';
import { openWindow, type Spawn } from '../../../engine/discord/views/windows';
import { deleteGame, insertGame } from '../../../drizzle/games';
import { getOrCreateGameSettings } from '../../../drizzle/game-settings';
import { setPhases } from '../../../drizzle/game-phases';
import { insertParticipants, listParticipants } from '../../../drizzle/participants';
import { FIRST } from './phases';
import { provisionGame, type Provisioned } from './provision';
import { syncGameRoles } from './roles';

/** The game config header; every window beneath it inherits the game. */
export const CONFIG_HEADER = 'gconfig';

export type CreateGameInput = {
  guild: bigint;
  creator: bigint;
  name: string;
  queue?: string | null;
  category?: bigint | null;
  storytellers: bigint[];
  kibitzers: bigint[];
  players: bigint[];
};

/**
 * Lazy, because the registry loads every view and a view (the queue entry's
 * Claim) imports this module: a static import would be a cycle.
 */
export const spawnByRoute: Spawn = async (route, target, options) =>
  spawnView((await import('../registry/views')).viewDefinitions.get(route)!, target, options);

const distinct = (members: bigint[]) => [...new Set(members)];

/**
 * A game from nothing to its config stack: rows, channel and threads, then
 * the header and its first window in GAME CONFIG.
 *
 * Takes a spawn target because posting a view needs an interaction, whichever
 * path got here - a command, a Claim press, a vacancy offer.
 */
export const createGame = async (
  target: SpawnTarget,
  input: CreateGameInput,
): Promise<Provisioned & { id: string }> => {
  const storytellers = distinct([input.creator, ...input.storytellers]);
  const kibitzers = distinct(input.kibitzers).filter((m) => !storytellers.includes(m));
  const players = distinct(input.players).filter((m) => !storytellers.includes(m) && !kibitzers.includes(m));

  const game = await insertGame({
    guild: input.guild,
    creator: input.creator,
    name: input.name,
    queue: input.queue ?? null,
    // Filled in once the channel exists; the column is required, and the
    // channel is named after a row that has to exist first.
    channel: 0n,
  });

  await getOrCreateGameSettings(game.id);
  await insertParticipants([
    ...storytellers.map((member) => ({ game: game.id, member, role: 'Storyteller' as const })),
    ...kibitzers.map((member) => ({ game: game.id, member, role: 'Kibitzer' as const })),
    ...players.map((member) => ({ game: game.id, member, role: 'Player' as const })),
  ]);
  await setPhases(game.id, [FIRST]);

  const participants = await listParticipants(game.id);
  const members = {
    storytellers: participants.filter((p) => p.role === 'Storyteller'),
    kibitzers: participants.filter((p) => p.role === 'Kibitzer'),
  };

  let provisioned: Provisioned;
  try {
    provisioned = await provisionGame(clientOf(target), game, members, input.category ?? null);
  } catch (error) {
    await deleteGame(game.id);
    throw error;
  }

  // The tracked roles come after the channel: a game that fails to provision leaves no roles behind.
  await syncGameRoles(clientOf(target), { ...game, channel: BigInt(provisioned.channel.id) });

  await openWindow(
    spawnByRoute,
    { ...target, channel: provisioned.threads.config as TextBasedChannel },
    CONFIG_HEADER,
    { entityId: game.id },
  );

  return { id: game.id, ...provisioned };
};
