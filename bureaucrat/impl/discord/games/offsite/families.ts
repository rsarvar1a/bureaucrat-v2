/**
 * Which mapping a channel falls under, and when a destination already
 * exists, decided over category ids alone. Pure: the Discord side, which
 * resolves each chain to its links, is `mappings.ts`.
 */

/** A mapped on-server archive family: its row and the ids of its chain's categories. */
export type Family<S> = { source: S; links: string[] };

/**
 * The family of the first category, in order, that any family holds. A
 * game is looked for under its channel's current parent, then under the
 * archive it is to be filed in.
 */
export const familyOf = <S>(families: Family<S>[], categories: (string | null | undefined)[]): S | null => {
  for (const category of categories) {
    if (!category) continue;
    const found = families.find((family) => family.links.includes(category));
    if (found) return found.source;
  }
  return null;
};

/** Whether a chain about to be mapped shares a category with one already mapped. */
export const overlaps = <S>(families: Family<S>[], links: string[]): boolean =>
  families.some((family) => family.links.some((link) => links.includes(link)));

/**
 * An existing destination the same as the one asked for: in the same
 * server, with the category somewhere in its chain. Two families pointed at
 * one archive share it, so a game is not copied there twice.
 */
export const reusableDestination = <D extends { destGuild: bigint }>(
  destinations: { destination: D; links: string[] }[],
  destGuild: bigint,
  category: string,
): D | null =>
  destinations.find((d) => d.destination.destGuild === destGuild && d.links.includes(category))?.destination ?? null;
