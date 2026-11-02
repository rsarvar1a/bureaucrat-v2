import type { Client } from 'discord.js';

export const displayNames = async (
  client: Client,
  guildId: bigint,
  members: Iterable<bigint | null | undefined>,
): Promise<Record<string, string>> => {
  const names: Record<string, string> = {};

  const guild = await client.guilds.fetch(String(guildId)).catch(() => null);
  if (!guild) return names;

  // Nulls are empty seats, which have nobody to look up.
  const ids = [...new Set([...members].filter((m): m is bigint => m != null).map(String))];
  const fetched = await Promise.allSettled(ids.map((id) => guild.members.fetch(id)));

  for (const result of fetched) {
    if (result.status === 'fulfilled') names[result.value.id] = result.value.displayName;
  }

  return names;
};
