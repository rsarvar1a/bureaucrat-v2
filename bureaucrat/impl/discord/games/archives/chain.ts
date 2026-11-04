/**
 * Archive categories come in chains: `Archives 1`, `Archives 2`, … A seed
 * category is named plainly (`Archives`) and becomes `Archives 1` the first
 * time it fills; each later one is the next number up. The chain reads
 * top-down, newest first: `Archives N` sits above `Archives N-1`, and within
 * each the most recent game is at the top.
 *
 * Pure: the Discord side is `categories.ts`.
 */

/** Discord's cap on channels in one category. */
export const CATEGORY_CAP = 50;

export type ChainName = { base: string; num: number | null };

/** `Archives 2` is base `Archives`, number 2; `Archives` alone is the seed, number null. */
export const parseChainName = (name: string): ChainName => {
  const match = /^(.*\S)\s+(\d+)$/.exec(name.trim());
  if (match) return { base: match[1]!, num: Number(match[2]) };
  return { base: name.trim(), num: null };
};

export const chainName = (base: string, num: number): string => `${base} ${num}`;

export type Link<T> = { item: T; num: number };

/**
 * The members of a chain among some categories, numbered: those whose base
 * is the given one, a seed counting as 1 unless a `… 1` exists beside it.
 * Sorted by number, ascending.
 */
export const chainLinks = <T extends { name: string }>(categories: T[], base: string): Link<T>[] => {
  const parsed = categories
    .map((item) => ({ item, name: parseChainName(item.name) }))
    .filter(({ name }) => name.base === base);
  const hasOne = parsed.some(({ name }) => name.num === 1);
  const links = parsed.flatMap(({ item, name }) =>
    name.num !== null ? [{ item, num: name.num }] : hasOne ? [] : [{ item, num: 1 }],
  );
  return links.sort((a, b) => a.num - b.num);
};

/**
 * Where a channel should sit after a reflow. Channels sorted oldest first
 * fill the chain from 1 upward, `cap` to a category, so the newest land in
 * the highest; within a category the newest is position 0, the top.
 */
export type Placement = { channel: string; parent: string; position: number };

/** How many categories a reflow needs for this many channels: at least one. */
export const categoriesNeeded = (channels: number, cap = CATEGORY_CAP): number =>
  Math.max(1, Math.ceil(channels / cap));

/**
 * The reflow plan. `links` are the chain's categories, enough of them
 * (`categoriesNeeded`); `channels` carry the date they are filed under.
 * Returns each channel's category and position, and the order the categories
 * themselves should take among the positions they already hold: highest
 * number topmost.
 */
export const planReflow = <C extends { id: string; position: number }>(
  links: Link<C>[],
  channels: { id: string; stamp: Date }[],
  cap = CATEGORY_CAP,
): { placements: Placement[]; categories: { id: string; position: number }[] } => {
  const ordered = [...links].sort((a, b) => a.num - b.num);
  const oldestFirst = [...channels].sort((a, b) => a.stamp.getTime() - b.stamp.getTime());

  const placements: Placement[] = [];
  for (const [index, link] of ordered.entries()) {
    const page = oldestFirst.slice(index * cap, index * cap + cap);
    // Newest at the top: the last of an oldest-first page is position 0.
    page
      .reverse()
      .forEach((channel, position) => placements.push({ channel: channel.id, parent: link.item.id, position }));
  }

  const slots = ordered.map((link) => link.item.position).sort((a, b) => a - b);
  const categories = [...ordered]
    .sort((a, b) => b.num - a.num)
    .map((link, index) => ({ id: link.item.id, position: slots[index]! }));

  return { placements, categories };
};
