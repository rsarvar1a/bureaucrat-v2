import { loadGuildAcl } from '../../drizzle/acl-grants';
import type { AclRole, AclBinding, AclGrant } from '../../schema/acl/grants.sql';

export type GuildAclData = {
  roles: (typeof AclRole.$inferSelect)[];
  bindings: (typeof AclBinding.$inferSelect)[];
  grants: (typeof AclGrant.$inferSelect)[];
  loadedAt: number;
};

const TTL_MS = 5 * 60 * 1000; // 5-minute safety-net TTL

const cache = new Map<bigint, GuildAclData>();

/**
 * Returns cached ACL data for a guild, loading from DB on cache miss or TTL expiry.
 */
export const getGuildAcl = async (guildId: bigint): Promise<GuildAclData> => {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) {
    return cached;
  }

  const data = await loadGuildAcl(guildId);
  const entry: GuildAclData = { ...data, loadedAt: Date.now() };
  cache.set(guildId, entry);
  return entry;
};

/**
 * Invalidates cached ACL data for a guild. Call after any ACL mutation.
 */
export const invalidateGuildAcl = (guildId: bigint): void => {
  cache.delete(guildId);
};
