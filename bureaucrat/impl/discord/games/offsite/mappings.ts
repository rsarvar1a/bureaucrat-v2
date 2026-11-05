import { ChannelType, type CategoryChannel, type Client, type Guild } from 'discord.js';
import {
  getDestination,
  insertDestination,
  insertSource,
  listDestinations,
  listSources,
  setSourceDestination,
  type OffsiteDestinationRow,
  type OffsiteSourceRow,
} from '../../../../drizzle/offsite';
import type { Game } from '../../../../schema/core/games.sql';
import { archiveFilingFor } from '../archive';
import { chainOf } from '../archives/categories';
import { familyOf, overlaps, reusableDestination } from './families';

type GameRow = typeof Game.$inferSelect;

/** The ids of a category's chain; the category alone if Discord no longer has it. */
const linksOf = async (guild: Guild, category: bigint): Promise<string[]> => {
  const chain = await chainOf(guild, category);
  return chain ? chain.links.map((link) => link.item.id) : [String(category)];
};

/** A mapping with its on-server chain resolved: `base` is the chain's name, null if the category is gone. */
export type ResolvedSource = { source: OffsiteSourceRow; base: string | null; links: string[] };

export const resolveSources = async (guild: Guild): Promise<ResolvedSource[]> =>
  Promise.all(
    (await listSources(BigInt(guild.id))).map(async (source) => {
      const chain = await chainOf(guild, source.category);
      return {
        source,
        base: chain?.base ?? null,
        links: chain ? chain.links.map((link) => link.item.id) : [String(source.category)],
      };
    }),
  );

/** The destination of the family the first of the categories that is mapped falls in. */
export const destinationForCategories = async (
  guild: Guild,
  categories: (string | null | undefined)[],
): Promise<OffsiteDestinationRow | null> => {
  const families = (await resolveSources(guild)).map(({ source, links }) => ({ source, links }));
  const source = familyOf(families, categories);
  return source ? ((await getDestination(source.destination)) ?? null) : null;
};

/**
 * Where a game is copied: the destination of the family its channel sits
 * in, or failing that of the archive it is to be filed in. The second is
 * how a game is placed at its end, before `/game archive` has moved it.
 */
export const destinationForGame = async (client: Client, game: GameRow): Promise<OffsiteDestinationRow | null> => {
  const guild = await client.guilds.fetch(String(game.guild)).catch(() => null);
  if (!guild) return null;
  const channel = await client.channels.fetch(String(game.channel)).catch(() => null);
  const parent = channel && !channel.isDMBased() && !channel.isThread() ? channel.parentId : null;
  const filing = await archiveFilingFor(game);
  return destinationForCategories(guild, [parent, filing ? String(filing.category) : null]);
};

/** The server and category a manager names by id, if the bot can see them. */
export const targetOf = async (
  client: Client,
  guildId: string,
  categoryId: string,
): Promise<{ guild: Guild; category: CategoryChannel } | null> => {
  if (!/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(categoryId)) return null;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const category = guild ? await guild.channels.fetch(categoryId).catch(() => null) : null;
  if (!guild || !category || category.type !== ChannelType.GuildCategory) return null;
  return { guild, category };
};

/** The guild's destination for that category's chain in that server, made if it has none. */
const destinationFor = async (
  sourceGuild: bigint,
  target: { guild: Guild; category: CategoryChannel },
): Promise<OffsiteDestinationRow> => {
  const destGuild = BigInt(target.guild.id);
  const candidates = await Promise.all(
    (await listDestinations(sourceGuild))
      .filter((destination) => destination.destGuild === destGuild)
      .map(async (destination) => ({ destination, links: await linksOf(target.guild, destination.category) })),
  );
  return (
    reusableDestination(candidates, destGuild, target.category.id) ??
    (await insertDestination({ guild: sourceGuild, destGuild, category: BigInt(target.category.id) }))
  );
};

export type MappingResult = { ok: true; source: OffsiteSourceRow } | { ok: false; reason: 'mapped' };

/** Maps an on-server archive family to a destination; refused if any of its chain is mapped already. */
export const addMapping = async (
  guild: Guild,
  category: bigint,
  target: { guild: Guild; category: CategoryChannel },
): Promise<MappingResult> => {
  const families = await resolveSources(guild);
  if (overlaps(families, await linksOf(guild, category))) return { ok: false, reason: 'mapped' };
  const destination = await destinationFor(BigInt(guild.id), target);
  const source = await insertSource({ guild: BigInt(guild.id), category, destination: destination.id });
  return { ok: true, source };
};

/**
 * Points one family elsewhere. Another family sharing its old destination
 * keeps it; the copies already made there stay on record against it.
 */
export const retargetMapping = async (
  source: OffsiteSourceRow,
  target: { guild: Guild; category: CategoryChannel },
): Promise<void> => {
  const destination = await destinationFor(source.guild, target);
  await setSourceDestination(source.id, destination.id);
};
