/** One link of a view's ancestry: its route, what it is about, and the ids its spawner named. */
export type AncestryLink = {
  route: string;
  entityId: string | null;
  id: string;
  ids: Record<string, string> | null;
};

/**
 * The id map a chain of views resolves event templates against: each link
 * contributes `route → entityId ?? id` and then whatever its spawner passed
 * as `ids`, root first, so a closer link overrides a farther one and a
 * spawner's explicit ids override the route's own. The same merge the spawn
 * does in memory, replayed from the rows for every later interaction.
 */
export const mergeAncestryIds = (rootFirst: AncestryLink[]): Record<string, string> => {
  const ids: Record<string, string> = {};
  for (const link of rootFirst) {
    ids[link.route] = link.entityId ?? link.id;
    Object.assign(ids, link.ids ?? {});
  }
  return ids;
};
