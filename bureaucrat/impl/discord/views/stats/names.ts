import type { Client } from 'discord.js';
import { listExportedNames } from '../../../../drizzle/stats';
import { displayNames } from '../queue/members';

/** Plain names for one page: the server's, then an export's for people who left, then the id. */
export const pageNames = async (client: Client, guild: bigint, members: bigint[]) => {
  const current = await displayNames(client, guild, members);
  const missing = members.filter((member) => current[String(member)] === undefined);
  const exported = new Map((await listExportedNames(missing)).map((row) => [row.member, row.displayName]));
  return (member: bigint) => current[String(member)] ?? exported.get(member) ?? String(member);
};
