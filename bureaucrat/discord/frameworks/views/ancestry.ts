import { sql } from 'drizzle-orm';
import { db } from '../../../utilities/db';

/**
 * Walks the parent chain from `viewId` up to the root using a recursive CTE.
 * Returns a map of `route → entityId ?? id` for every ancestor (including self).
 *
 * When merging, ancestors closer to the current view (i.e. processed first)
 * take precedence — so self/child IDs naturally win over grandparent IDs.
 */
export async function resolveAncestry(
  viewId: string,
): Promise<{ ids: Record<string, string>; entityId: string | null }> {
  const rows = await db.execute<{ route: string; entity_id: string | null; id: string }>(sql`
    WITH RECURSIVE ancestry AS (
      SELECT id, route, "entityId" AS entity_id, parent
      FROM abc."View"
      WHERE id = ${viewId}
      UNION ALL
      SELECT v.id, v.route, v."entityId" AS entity_id, v.parent
      FROM abc."View" v
      JOIN ancestry a ON v.id = a.parent
    )
    SELECT route, entity_id, id FROM ancestry
  `);

  // The direct parent is rows[0] (the starting viewId).
  const parentEntityId = rows[0]?.entity_id ?? null;

  // Build the map in reverse (root first) so that closer ancestors override.
  const ids: Record<string, string> = {};
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    ids[row.route] = row.entity_id ?? row.id;
  }
  return { ids, entityId: parentEntityId };
}
