import type { Client, Guild } from 'discord.js';
import { getDestination } from '../../../../../drizzle/offsite';
import { getOrCreateGuildSettings } from '../../../../../drizzle/guild-settings';
import { listQueueArchives } from '../../../../../drizzle/queues';
import { chainOf } from '../../../games/archives/categories';
import { overlaps } from '../../../games/offsite/families';
import { resolveSources, type ResolvedSource } from '../../../games/offsite/mappings';
import { destinationOf } from '../../../games/offsite/write';
import { S } from '../../../../../strings';

/** A mapping as the pane shows it: the family, where it goes, and whether the bot can work there. */
export type MappingLine = {
  resolved: ResolvedSource;
  family: string;
  /** Where it goes, as links into the archive server. */
  target: string;
  /** The same, as plain text, for a select option. */
  plain: string;
  problem: string | null;
};

export const describeMappings = async (client: Client, guild: Guild): Promise<MappingLine[]> =>
  Promise.all(
    (await resolveSources(guild)).map(async (resolved) => {
      const row = await getDestination(resolved.source.destination);
      const check = await destinationOf(client, row);
      const destGuild = row ? client.guilds.cache.get(String(row.destGuild)) : undefined;
      const target = S.offsite.mappingTarget(
        {
          id: String(row?.destGuild ?? ''),
          name: check.ok ? check.guild.name : (destGuild?.name ?? String(row?.destGuild ?? '?')),
        },
        { id: String(row?.category ?? ''), name: check.ok ? check.category.name : String(row?.category ?? '?') },
      );
      const problem = check.ok
        ? null
        : check.reason === 'missing'
          ? S.errors.offsiteNotReachable(check.missing)
          : S.errors.archiveGone;
      const plain = check.ok ? `${check.guild.name} › ${check.category.name}` : (destGuild?.name ?? '?');
      return { resolved, family: resolved.base ?? S.offsite.familyGone, target, plain, problem };
    }),
  );

/** The archives games are filed into that no mapping covers, by their chains' names. */
export const unmappedArchives = async (guild: Guild, mapped: ResolvedSource[]): Promise<string[]> => {
  const guildId = BigInt(guild.id);
  const settings = await getOrCreateGuildSettings(guildId);
  const roots = [settings.archive, ...(await listQueueArchives(guildId)).map((q) => q.archive)].filter(
    (c): c is bigint => c !== null,
  );
  const names = new Set<string>();
  for (const root of roots) {
    const chain = await chainOf(guild, root);
    if (!chain || names.has(chain.base)) continue;
    if (
      !overlaps(
        mapped,
        chain.links.map((link) => link.item.id),
      )
    )
      names.add(chain.base);
  }
  return [...names];
};
