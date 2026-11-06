import type { Client } from 'discord.js';
import { listExportedUsernames } from '../../../../drizzle/stats';

/**
 * Usernames for one page, which fit a table better than display names: Discord's,
 * then an export's if Discord will not say, then the id. Not limited to the
 * server, so people who have left keep their names.
 */
export const pageNames = async (client: Client, members: bigint[]) => {
  const fetched = await Promise.allSettled(members.map((member) => client.users.fetch(String(member))));
  const names = new Map<bigint, string>();
  fetched.forEach((result, i) => {
    if (result.status === 'fulfilled') names.set(members[i]!, result.value.username);
  });

  const missing = members.filter((member) => !names.has(member));
  for (const row of await listExportedUsernames(missing)) names.set(row.member, row.username);

  return (member: bigint) => names.get(member) ?? String(member);
};
