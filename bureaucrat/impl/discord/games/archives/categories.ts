import { ChannelType, DiscordAPIError, type CategoryChannel, type Guild, type GuildBasedChannel } from 'discord.js';
import { withLock } from '../../../../utilities/lock';
import { logger } from '../../../../utilities/logger';
import { CATEGORY_CAP, categoriesNeeded, chainLinks, chainName, parseChainName, planReflow, type Link } from './chain';

/**
 * The Discord side of an archive chain (see `chain.ts`): finding a
 * category's chain, rolling over to the next link when one fills, and
 * reflowing every channel across the chain in date order.
 */

export type Chain = { base: string; links: Link<CategoryChannel>[] };

const categoriesOf = async (guild: Guild): Promise<CategoryChannel[]> => {
  const channels = await guild.channels.fetch();
  return [...channels.values()].filter((c): c is CategoryChannel => c?.type === ChannelType.GuildCategory);
};

/** The chain a category belongs to, which is at least itself. Null if the category is gone. */
export const chainOf = async (guild: Guild, categoryId: bigint): Promise<Chain | null> => {
  const categories = await categoriesOf(guild);
  const current = categories.find((c) => c.id === String(categoryId));
  if (!current) return null;
  const { base } = parseChainName(current.name);
  return { base, links: chainLinks(categories, base) };
};

/** Whether a channel sits in any link of the chain. */
export const inChain = (chain: Chain, channel: { parentId: string | null }): boolean =>
  chain.links.some((link) => link.item.id === channel.parentId);

const fill = (category: CategoryChannel): number => category.children.cache.size;

/**
 * A new link after the chain's last, named one up and placed directly above
 * it with its permission overwrites, so a read-only archive stays read-only.
 * A seed still named plainly is renamed `… 1` first, since it is about to
 * have a sibling.
 */
export const extendChain = async (guild: Guild, chain: Chain, reason: string): Promise<Link<CategoryChannel>> => {
  const last = chain.links.at(-1);
  if (!last) throw new Error(`The ${chain.base} chain has no categories.`);

  if (parseChainName(last.item.name).num === null) {
    await last.item.setName(chainName(chain.base, last.num), reason);
  }

  const num = last.num + 1;
  const category = await guild.channels.create({
    name: chainName(chain.base, num),
    type: ChannelType.GuildCategory,
    position: last.item.position,
    permissionOverwrites: last.item.permissionOverwrites.cache.map((o) => ({
      id: o.id,
      type: o.type,
      allow: o.allow,
      deny: o.deny,
    })),
    reason,
  });
  logger.info({ message: `Archive chain ${chain.base}: created ${category.name} in guild ${guild.id}.` });

  const link = { item: category, num };
  chain.links.push(link);
  return link;
};

export type Room = { category: CategoryChannel; pivoted: boolean };

/**
 * A category of the chain with room for one more channel: the configured
 * one while it has any, else the chain's last link, else a new one. When
 * the answer is not the configured category, `pivot` is told so the
 * configuration can follow it. `full` names categories Discord has refused
 * a channel for, whatever the cache counts.
 */
export const roomIn = async (
  guild: Guild,
  chain: Chain,
  categoryId: bigint,
  pivot: (next: CategoryChannel) => Promise<void>,
  reason = 'Archive category full',
  full: ReadonlySet<string> = new Set(),
): Promise<Room> => {
  const hasRoom = (category: CategoryChannel): boolean => !full.has(category.id) && fill(category) < CATEGORY_CAP;
  const current = chain.links.find((link) => link.item.id === String(categoryId)) ?? chain.links[0]!;
  if (hasRoom(current.item)) return { category: current.item, pivoted: false };

  const last = chain.links.at(-1)!;
  const next = last.num > current.num && hasRoom(last.item) ? last : await extendChain(guild, chain, reason);
  await pivot(next.item);
  return { category: next.item, pivoted: true };
};

/** Discord's refusal of a channel because its category already holds fifty. */
export const isCategoryFull = (error: unknown): boolean =>
  error instanceof DiscordAPIError &&
  error.code === 50035 &&
  JSON.stringify(error.rawError).includes('CHANNEL_PARENT_MAX_CHANNELS');

/**
 * Runs `fn` on a fresh read of the category's chain, one caller per chain at
 * a time: deciding where a channel goes and putting it there is a
 * check-then-act, and two copies landing at once would otherwise both see
 * the forty-ninth slot free or both make the next link. Null if the
 * category is gone.
 */
export const withChain = async <T>(
  guild: Guild,
  categoryId: bigint,
  fn: (chain: Chain) => Promise<T>,
): Promise<T | null> => {
  const first = await chainOf(guild, categoryId);
  if (!first) return null;
  return withLock(`chain:${guild.id}:${first.base}`, async () => {
    const chain = await chainOf(guild, categoryId);
    return chain ? fn(chain) : null;
  });
};

/** Tries a placement gets when Discord says the category it chose is full. */
const PLACE_ATTEMPTS = 3;

/**
 * Finds room in the chain (`roomIn`) and puts something there with `place`,
 * under the chain's lock. Should Discord still refuse for a full category
 * (a channel added by hand, or a cache behind), that category is counted
 * full and the room found again.
 */
export const placeInChain = async <T>(
  guild: Guild,
  categoryId: bigint,
  pivot: (next: CategoryChannel) => Promise<void>,
  place: (category: CategoryChannel) => Promise<T>,
  reason?: string,
): Promise<(Room & { placed: T }) | null> =>
  withChain(guild, categoryId, async (chain) => {
    const full = new Set<string>();
    for (let attempt = 1; ; attempt++) {
      const room = await roomIn(guild, chain, categoryId, pivot, reason, full);
      try {
        return { ...room, placed: await place(room.category) };
      } catch (error) {
        if (!isCategoryFull(error) || attempt >= PLACE_ATTEMPTS) throw error;
        logger.warn({ message: `Archive chain ${chain.base}: ${room.category.name} is full, finding room again.` });
        full.add(room.category.id);
        // The pivot moved the configuration on; later rounds start from where it points.
        categoryId = BigInt(room.category.id);
      }
    }
  });

export type StampOf = (channel: GuildBasedChannel) => Promise<Date>;

export type Reflow = { chain: Chain; channels: number; current: CategoryChannel };

/**
 * Every channel across the chain, in date order: the newest at the top of
 * the highest link, the oldest at the bottom of the first, links made as
 * needed and ordered top-down. Returns the link new games should go to: the
 * last one with anything in it.
 */
export const reflowChain = async (
  guild: Guild,
  categoryId: bigint,
  stampOf: StampOf,
  reason = 'Archive reflow',
): Promise<Reflow | null> =>
  // Under the chain's lock, so a copy landing mid-reflow neither races the
  // new links nor lands somewhere the plan then moves it from.
  withChain(guild, categoryId, async (chain) => {
    const children = chain.links.flatMap((link) => [...link.item.children.cache.values()]);
    const stamped = await Promise.all(
      children.map(async (channel) => ({ id: channel.id, stamp: await stampOf(channel) })),
    );

    const needed = categoriesNeeded(stamped.length);
    while (chain.links.length < needed) await extendChain(guild, chain, reason);
    if (chain.links.length > 1 && parseChainName(chain.links[0]!.item.name).num === null) {
      await chain.links[0]!.item.setName(chainName(chain.base, chain.links[0]!.num), reason);
    }

    const { placements, categories } = planReflow(chain.links, stamped);

    // Discord's bulk position update takes one parent change per request, so
    // each move is its own call; the ordering within the links is then one batch.
    const byId = new Map(children.map((channel) => [channel.id, channel]));
    for (const placement of placements) {
      const channel = byId.get(placement.channel);
      if (!channel || channel.isThread() || channel.parentId === placement.parent) continue;
      await channel.setParent(placement.parent, { lockPermissions: true, reason });
    }
    if (categories.length > 1) {
      await guild.channels.setPositions(categories.map((c) => ({ channel: c.id, position: c.position })));
    }
    if (placements.length > 0) {
      await guild.channels.setPositions(placements.map((p) => ({ channel: p.channel, position: p.position })));
    }

    const current = chain.links[Math.min(needed, chain.links.length) - 1]!.item;
    return { chain, channels: stamped.length, current };
  });
