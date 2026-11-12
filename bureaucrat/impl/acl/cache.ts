import { getAccessConfig } from '../../drizzle/guild-settings';
import type { AccessConfig } from './archetypes';

const TTL_MS = 5 * 60 * 1000; // 5-minute safety-net TTL

const cache = new Map<bigint, { config: AccessConfig; loadedAt: number }>();

/** A guild's archetype roles, from the cache when fresh. Every guarded action reads this. */
export const getGuildAccess = async (guild: bigint): Promise<AccessConfig> => {
  const cached = cache.get(guild);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.config;

  const config = await getAccessConfig(guild);
  cache.set(guild, { config, loadedAt: Date.now() });
  return config;
};

/** Call after changing a guild's archetype roles. */
export const invalidateGuildAccess = (guild: bigint): void => {
  cache.delete(guild);
};
