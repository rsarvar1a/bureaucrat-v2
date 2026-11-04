import { ChannelType, type CategoryChannel, type Guild, type GuildBasedChannel } from 'discord.js';
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
 * configuration can follow it.
 */
export const roomIn = async (
  guild: Guild,
  chain: Chain,
  categoryId: bigint,
  pivot: (next: CategoryChannel) => Promise<void>,
  reason = 'Archive category full',
): Promise<Room> => {
  const current = chain.links.find((link) => link.item.id === String(categoryId)) ?? chain.links[0]!;
  if (fill(current.item) < CATEGORY_CAP) return { category: current.item, pivoted: false };

  const last = chain.links.at(-1)!;
  const next =
    last.num > current.num && fill(last.item) < CATEGORY_CAP ? last : await extendChain(guild, chain, reason);
  await pivot(next.item);
  return { category: next.item, pivoted: true };
};

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
): Promise<Reflow | null> => {
  const chain = await chainOf(guild, categoryId);
  if (!chain) return null;

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
  if (categories.length > 1)
    await guild.channels.setPositions(categories.map((c) => ({ channel: c.id, position: c.position })));
  if (placements.length > 0) {
    await guild.channels.setPositions(
      placements.map((p) => ({ channel: p.channel, parent: p.parent, position: p.position, lockPermissions: true })),
    );
  }

  const current = chain.links[Math.min(needed, chain.links.length) - 1]!.item;
  return { chain, channels: stamped.length, current };
};
