import { sql } from 'drizzle-orm';
import { db } from '../../../utilities/db';
import { mergeAncestryIds } from './ids';

/**
 * Walks the parent chain from `viewId` up to the root using a recursive CTE.
 * Returns a map of `route → entityId ?? id` for every ancestor (including self),
 * overlaid with the ids each spawner named (see `mergeAncestryIds`).
 *
 * When merging, ancestors closer to the current view (i.e. processed first)
 * take precedence — so self/child IDs naturally win over grandparent IDs.
 */
export async function resolveAncestry(
  viewId: string,
): Promise<{ ids: Record<string, string>; entityId: string | null }> {
  const rows = await db.execute<{
    route: string;
    entity_id: string | null;
    id: string;
    ids: Record<string, string> | null;
  }>(sql`
    WITH RECURSIVE ancestry AS (
      SELECT id, route, "entityId" AS entity_id, ids, parent
      FROM abc."View"
      WHERE id = ${viewId}
      UNION ALL
      SELECT v.id, v.route, v."entityId" AS entity_id, v.ids, v.parent
      FROM abc."View" v
      JOIN ancestry a ON v.id = a.parent
    )
    SELECT route, entity_id, id, ids FROM ancestry
  `);

  // The direct parent is rows[0] (the starting viewId).
  const parentEntityId = rows[0]?.entity_id ?? null;

  // Root first, so that closer ancestors override.
  const ids = mergeAncestryIds(
    [...rows].reverse().map((row) => ({ route: row.route, entityId: row.entity_id, id: row.id, ids: row.ids })),
  );
  return { ids, entityId: parentEntityId };
}
